import torch
import torch.nn as nn
import torch.nn.functional as F
import math
import random
import json
import hashlib
import numpy as np
from dataclasses import dataclass
from typing import List, Dict, Optional
from pathlib import Path
import pickle
from tqdm import tqdm


@dataclass
class ModelConfig:
    """Configuration for a single model in the ensemble."""
    name: str
    seed: int
    
    # Architecture choices
    use_multiscale: bool
    use_channel_attention: bool
    num_branches: int
    branch_hidden_dim: int
    d_model: int
    dropout: float
    
    # Augmentation parameters
    aug_noise_std: float
    aug_channel_drop: float
    aug_time_mask_len: int
    aug_prob: float
    amp_scale_range: tuple  # (min, max) for amplitude scaling
    
    # Training parameters
    learning_rate: float
    weight_decay: float
    scheduler_type: str  # 'cosine', 'step', 'plateau'
    
    # Ensemble-specific
    ensemble_strategy: str  # 'mean', 'median', 'trimmed_mean'
    branch_drop_rate: float
    
    # only used during huber loss
    huber_delta: float = 1.0
    
    def to_dict(self):
        return {k: v for k, v in self.__dict__.items()}
    
    def get_hash(self):
        """Unique hash for this configuration."""
        config_str = json.dumps(self.to_dict(), sort_keys=True)
        return hashlib.md5(config_str.encode()).hexdigest()[:8]


class EEGAugmentation:
    """EEG-specific augmentations to improve generalization across subjects.
    
    Regular class (not nn.Module) since it has no learnable parameters.
    """
    def __init__(self, noise_std=0.1, channel_drop_prob=0.1, 
                 time_mask_len=20, aug_prob=0.5, amp_scale_range=(0.8, 1.2)):
        self.noise_std = noise_std
        self.channel_drop_prob = channel_drop_prob
        self.time_mask_len = time_mask_len
        self.aug_prob = aug_prob
        self.amp_scale_range = amp_scale_range
        self.training = True  # Controlled by model's train()/eval()
    
    def train(self, mode=True):
        self.training = mode
    
    def eval(self):
        self.training = False
    
    def __call__(self, x):
        # x: (B, C, T)
        if not self.training:
            return x
        
        # CRITICAL FIX: Clone to avoid modifying the original dataset in memory
        x = x.clone()
        B, C, T = x.shape
        
        # Gaussian noise injection
        if random.random() < self.aug_prob:
            x = x + torch.randn_like(x) * self.noise_std
        
        # Channel dropout (simulate electrode issues)
        if random.random() < self.aug_prob:
            mask = (torch.rand(B, C, 1, device=x.device) > self.channel_drop_prob).float()
            x = x * mask
        
        # Time masking (SpecAugment style for temporal robustness)
        if random.random() < self.aug_prob:
            for b in range(B):
                t_start = random.randint(0, max(0, T - self.time_mask_len))
                x[b, :, t_start:t_start + self.time_mask_len] = 0
        
        # Amplitude scaling (per-sample) using configured range
        if random.random() < self.aug_prob:
            scale = self.amp_scale_range[0] + \
                    (self.amp_scale_range[1] - self.amp_scale_range[0]) * \
                    torch.rand(B, 1, 1, device=x.device)
            x = x * scale
        
        return x


class ChannelAttention(nn.Module):
    """Squeeze-and-Excitation style attention for EEG channels."""
    def __init__(self, num_channels, reduction=4):
        super().__init__()
        self.fc = nn.Sequential(
            nn.Linear(num_channels, num_channels // reduction),
            nn.GELU(),
            nn.Linear(num_channels // reduction, num_channels),
            nn.Sigmoid()
        )
    
    def forward(self, x):
        # x: (B, C, T)
        # Global average pooling over time
        y = x.mean(dim=-1)  # (B, C)
        y = self.fc(y)  # (B, C)
        return x * y.unsqueeze(-1)


class MultiScaleTemporalConv(nn.Module):
    """Multi-scale temporal convolutions to capture different frequency patterns.
    
    Uses depthwise separable convolutions: depthwise conv at each scale,
    then concatenate and project with pointwise conv.
    """
    def __init__(self, in_channels, out_channels):
        super().__init__()
        # Depthwise convs: each outputs in_channels (same as input for depthwise)
        # Different kernel sizes for different temporal scales
        self.conv_small = nn.Conv1d(in_channels, in_channels, kernel_size=5, 
                                     padding=2, groups=in_channels)
        self.conv_medium = nn.Conv1d(in_channels, in_channels, kernel_size=15, 
                                      padding=7, groups=in_channels)
        self.conv_large = nn.Conv1d(in_channels, in_channels, kernel_size=25, 
                                     padding=12, groups=in_channels)
        self.conv_xlarge = nn.Conv1d(in_channels, in_channels, kernel_size=51, 
                                      padding=25, groups=in_channels)
        
        # Pointwise conv to mix multi-scale features and project to out_channels
        self.pointwise = nn.Conv1d(in_channels * 4, out_channels, kernel_size=1)
        self.bn = nn.BatchNorm1d(out_channels)
    
    def forward(self, x):
        # Capture multiple temporal scales (depthwise)
        x1 = self.conv_small(x)
        x2 = self.conv_medium(x)
        x3 = self.conv_large(x)
        x4 = self.conv_xlarge(x)
        
        # Concatenate: (B, in_channels * 4, T)
        out = torch.cat([x1, x2, x3, x4], dim=1)
        
        # Pointwise projection to out_channels
        out = self.pointwise(out)
        return self.bn(out)

class CNNBranch(nn.Module):
    """Individual CNN branch for ensemble. Each branch is a complete classifier."""
    def __init__(self, in_channels, num_outputs, hidden_dim=64, dropout=0.3,
                 branch_id=0, num_branches=8):
        super().__init__()
        
        # Vary kernel sizes across branches for diversity
        kernel_sizes = [3, 5, 7, 9, 11, 13, 15, 17]
        k1 = kernel_sizes[branch_id % len(kernel_sizes)]
        k2 = max(3, k1 - 2)
        
        # Temporal processing with different receptive fields per branch
        self.temp_conv1 = nn.Conv1d(in_channels, hidden_dim, kernel_size=k1, padding=k1//2)
        self.bn1 = nn.BatchNorm1d(hidden_dim)
        self.temp_conv2 = nn.Conv1d(hidden_dim, hidden_dim, kernel_size=k2, padding=k2//2)
        self.bn2 = nn.BatchNorm1d(hidden_dim)
        
        # Vary pooling strategy per branch for diversity
        self.use_max_pool = (branch_id % 4) in [0, 1, 2]
        self.use_avg_pool = (branch_id % 4) in [0, 2, 3]
        self.use_std_pool = (branch_id % 4) == 3  # Add std pooling
        
        # Calculate pooled feature size
        pool_features = hidden_dim * (
            int(self.use_max_pool) + 
            int(self.use_avg_pool) + 
            int(self.use_std_pool)
        )
        
        # Vary dropout per branch (some branches more regularized)
        # Range from 0.85x to 1.15x of base dropout
        branch_dropout = dropout * (0.85 + 0.3 * (branch_id / max(1, num_branches - 1)))
        
        # ==== MARKER: AGE INPUT REMOVED ====
        # To re-enable age as input, uncomment the following 4 lines:
        # self.age_proj = nn.Sequential(
        #     nn.Linear(1, 16),
        #     nn.GELU()
        # )
        # ==== END MARKER ====
        
        # Classification head
        # ==== MARKER: AGE INPUT REMOVED ====
        # Change pool_features to pool_features + 16 if re-enabling age
        self.classifier = nn.Sequential(
            nn.Linear(pool_features, hidden_dim),
            nn.BatchNorm1d(hidden_dim),
            nn.GELU(),
            nn.Dropout(branch_dropout),
            nn.Linear(hidden_dim, num_outputs)
        )
        
    # ==== MARKER: AGE INPUT REMOVED ====
    # To re-enable age: change forward(self, x) to forward(self, x, age)
    def forward(self, x):
        # x: (B, C, T)
        x = F.gelu(self.bn1(self.temp_conv1(x)))
        x = F.dropout(x, p=0.2, training=self.training)
        x = F.gelu(self.bn2(self.temp_conv2(x)))
        x = F.dropout(x, p=0.2, training=self.training)
        
        # Global pooling with diversity
        pools = []
        if self.use_max_pool:
            pools.append(F.adaptive_max_pool1d(x, 1).squeeze(-1))
        if self.use_avg_pool:
            pools.append(F.adaptive_avg_pool1d(x, 1).squeeze(-1))
        if self.use_std_pool:
            # Standard deviation pooling (captures temporal variability)
            std = torch.sqrt(x.var(dim=-1, unbiased=False) + 1e-6)
            pools.append(std)
        
        pooled = torch.cat(pools, dim=1)
        
        # ==== MARKER: AGE INPUT REMOVED ====
        # To re-enable age, uncomment these 2 lines and comment the next line:
        # age_emb = self.age_proj(age)
        # features = torch.cat([pooled, age_emb], dim=1)
        features = pooled
        # ==== END MARKER ====
        
        output = self.classifier(features)
        
        return output

class CNNEnsemble(nn.Module):
    """Ensemble of CNN classifiers for robust EEG prediction.
    
    Replaces the complex MoE transformer with multiple independent CNN branches
    that are simpler, less prone to overfitting, and can learn diverse patterns.
    """
    def __init__(self, in_channels=128, seq_len=200, d_model=128, num_outputs=4, dropout=0.3,
                 num_branches=8, branch_hidden_dim=64, use_augmentation=True, 
                 use_multiscale=True, use_channel_attention=True, ensemble_strategy='mean',
                 branch_drop_rate=0.1):
        super().__init__()
        
        # CRITICAL: Validate weighted ensemble + stochastic depth incompatibility
        if ensemble_strategy == 'weighted' and branch_drop_rate > 0:
            raise ValueError(
                f"ensemble_strategy='weighted' is incompatible with branch_drop_rate={branch_drop_rate} > 0. "
                "The learned branch weights cannot train properly when branches are randomly dropped. "
                "Either set branch_drop_rate=0.0 or use a different ensemble_strategy ('mean', 'median', 'trimmed_mean')."
            )
        
        self.use_augmentation = use_augmentation
        self.use_multiscale = use_multiscale
        self.use_channel_attention = use_channel_attention
        self.num_branches = num_branches
        self.ensemble_strategy = ensemble_strategy  # 'mean', 'median', 'weighted', or 'trimmed_mean'
        self.branch_drop_rate = branch_drop_rate
        
        # 0. EEG Augmentation (only during training)
        if use_augmentation:
            self.augmentation = EEGAugmentation(
                noise_std=0.05, channel_drop_prob=0.1,
                time_mask_len=15, aug_prob=0.5, amp_scale_range=(0.8, 1.2)
            )
        
        # 1. Shared Temporal CNN Feature Extractor
        if use_multiscale:
            self.temporal_conv = MultiScaleTemporalConv(in_channels, in_channels)
        else:
            self.temporal_conv = nn.Sequential(
                nn.Conv1d(in_channels, in_channels, kernel_size=25, padding=12, groups=in_channels),
                nn.BatchNorm1d(in_channels)
            )
        
        # 1.5 Shared Channel Attention
        if use_channel_attention:
            self.channel_attn = ChannelAttention(in_channels, reduction=4)
        
        # 2. Shared Spatial CNN Feature Extractor with residual connection
        self.spatial_conv = nn.Sequential(
            nn.Conv1d(in_channels, d_model//2, kernel_size=1),
            nn.BatchNorm1d(d_model//2),
            nn.GELU(),
            nn.Conv1d(d_model//2, d_model, kernel_size=1),
            nn.BatchNorm1d(d_model),
        )
        
        # Residual projection if channels don't match
        self.residual_proj = nn.Conv1d(in_channels, d_model, kernel_size=1) \
            if in_channels != d_model else nn.Identity()
        
        # 3. CNN Ensemble - Multiple independent branches with diversity
        self.branches = nn.ModuleList([
            CNNBranch(
                in_channels=d_model,
                num_outputs=num_outputs,
                hidden_dim=branch_hidden_dim,
                dropout=dropout,
                branch_id=i,  # Pass branch ID for diversity
                num_branches=num_branches
            )
            for i in range(num_branches)
        ])
        
        # Optional: Learnable weights for weighted ensemble
        if ensemble_strategy == 'weighted':
            self.branch_weights = nn.Parameter(torch.ones(num_branches) / num_branches)
        
    def train(self, mode=True):
        """Override train to also set augmentation mode."""
        super().train(mode)
        if self.use_augmentation and hasattr(self, 'augmentation'):
            self.augmentation.train(mode)
        return self
    
    # ==== MARKER: AGE INPUT REMOVED ====
    # To re-enable age: change forward(self, x) to forward(self, x, age)
    def forward(self, x):
        # Input x: (Batch, Channels, Time)
        
        # Apply augmentation (only during training)
        if self.use_augmentation and hasattr(self, 'augmentation'):
            x = self.augmentation(x)
        
        # Shared feature extraction
        # Temporal CNN
        x = self.temporal_conv(x)
        x = F.gelu(x)
        x = F.dropout(x, p=0.1, training=self.training)
        
        # Channel Attention
        if self.use_channel_attention and hasattr(self, 'channel_attn'):
            x = self.channel_attn(x)
        
        # Spatial CNN with residual connection
        identity = self.residual_proj(x)
        x = self.spatial_conv(x)
        x = F.gelu(x + identity)  # Residual connection
        x = F.dropout(x, p=0.1, training=self.training)
        
        # Get predictions from branches with stochastic depth
        branch_outputs = []
        active_branches = 0
        
        for branch in self.branches:
            # During training, randomly drop some branches
            if self.training and random.random() < self.branch_drop_rate:
                continue
            
            # ==== MARKER: AGE INPUT REMOVED ====
            # To re-enable age: change branch(x) to branch(x, age)
            out = branch(x)
            branch_outputs.append(out)
            active_branches += 1
        
        # Ensure at least one branch is active
        if active_branches == 0:
            # ==== MARKER: AGE INPUT REMOVED ====
            # To re-enable age: change .branches[0](x) to .branches[0](x, age)
            branch_outputs = [self.branches[0](x)]
        
        # Stack all predictions: (num_branches, B, num_outputs)
        branch_outputs = torch.stack(branch_outputs, dim=0)
        
        # Ensemble strategy
        if self.ensemble_strategy == 'mean':
            # Simple average
            final_output = branch_outputs.mean(dim=0)
        elif self.ensemble_strategy == 'median':
            # Median (more robust to outliers)
            final_output = branch_outputs.median(dim=0)[0]
        elif self.ensemble_strategy == 'weighted':
            # Learnable weighted average
            num_active = branch_outputs.size(0)
            if num_active == self.num_branches:
                # All branches active - use learned weights
                weights = F.softmax(self.branch_weights, dim=0)
                weights = weights.view(-1, 1, 1)  # (num_branches, 1, 1)
                final_output = (branch_outputs * weights).sum(dim=0)
            else:
                # Some branches dropped during training - fall back to mean
                final_output = branch_outputs.mean(dim=0)
        elif self.ensemble_strategy == 'trimmed_mean':
            # Remove top and bottom 25% predictions, average the rest
            # More robust than mean or median
            num_active = branch_outputs.size(0)
            if num_active >= 5:  # Need at least 5 for meaningful 25% trim
                sorted_outputs = torch.sort(branch_outputs, dim=0)[0]
                trim = max(1, int(num_active * 0.25))  # At least trim 1
                # Safety: ensure we don't trim everything
                if trim * 2 >= num_active:
                    trim = max(1, (num_active - 1) // 2)
                final_output = sorted_outputs[trim:num_active-trim].mean(dim=0)
            else:
                # For 2-4 models, use median or mean
                if num_active >= 3:
                    final_output = branch_outputs.median(dim=0)[0]
                else:
                    final_output = branch_outputs.mean(dim=0)
        else:
            final_output = branch_outputs.mean(dim=0)
        
        # Return output and dummy aux_loss for compatibility
        return final_output, torch.tensor(0.0, device=x.device)
    
    # ==== MARKER: AGE INPUT REMOVED ====
    # To re-enable age: change get_branch_predictions(self, x) to get_branch_predictions(self, x, age)
    def get_branch_predictions(self, x):
        """Get individual predictions from all branches for analysis."""
        if self.use_augmentation and hasattr(self, 'augmentation'):
            # Temporarily disable augmentation
            aug_mode = self.augmentation.training
            self.augmentation.eval()
        
        # Feature extraction
        x = self.temporal_conv(x)
        x = F.gelu(x)
        
        if self.use_channel_attention and hasattr(self, 'channel_attn'):
            x = self.channel_attn(x)
        
        x = self.spatial_conv(x)
        
        # Get predictions from all branches
        branch_outputs = []
        for branch in self.branches:
            # ==== MARKER: AGE INPUT REMOVED ====
            # To re-enable age: change branch(x) to branch(x, age)
            out = branch(x)
            branch_outputs.append(out)
        
        if self.use_augmentation and hasattr(self, 'augmentation'):
            # Restore augmentation mode
            self.augmentation.train(aug_mode)
        
        return torch.stack(branch_outputs, dim=0)  # (num_branches, B, num_outputs)

# =============================================================================
# Model Zoo and Ensemble Training System
# =============================================================================

class ModelZoo:
    """Generate diverse model configurations."""
    
    @staticmethod
    def generate_diverse_configs(num_models: int, base_seed: int = 42) -> List[ModelConfig]:
        """Generate highly diverse model configurations."""
        configs = []
        
        # Define variation ranges
        #  These variations were used for the first 30 models saved in run1 
        # multiscale_options = [True, False]
        # channel_attn_options = [True, False]
        # num_branches_options = [4, 6, 8, 10, 12, 14, 16, 20]
        # hidden_dim_options = [32, 40, 48, 56, 64, 72, 80]
        # d_model_options = [96, 128, 160, 192]
        # dropout_options = [0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55]
        
        # # Augmentation variations
        # noise_std_options = [0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1]
        # channel_drop_options = [0.05, 0.08, 0.1, 0.12, 0.15, 0.18, 0.2]
        # time_mask_options = [8, 10, 12, 15, 18, 20, 25, 30]
        # aug_prob_options = [0.3, 0.4, 0.5, 0.6, 0.7]
        
        # # Training variations
        # lr_options = [1e-4, 5e-4, 1e-3, 2e-3, 3e-3]
        # wd_options = [1e-5, 5e-5, 1e-4, 5e-4, 1e-3]
        # scheduler_options = ['cosine', 'step', 'plateau']
        
        # # Ensemble strategy variations
        # ensemble_strategies = ['mean', 'median', 'trimmed_mean']
        # branch_drop_options = [0.0, 0.1, 0.15, 0.2]
        
        # Here are the new variations as many of the previous ones (above) hit their limit based on the train config json file from run1
        # Define variation ranges
        # multiscale_options = [True, False]
        # channel_attn_options = [True, False]
        # num_branches_options = [6, 8, 10, 12, 14, 16] # Narrowed slightly based on top models
        # hidden_dim_options = [64, 72, 80, 88, 96, 112] # SHIFTED UP
        # d_model_options = [96, 128, 160, 192]
        # dropout_options = [0.45, 0.50, 0.55, 0.60, 0.65, 0.70] # SHIFTED UP
        
        # # Augmentation variations
        # noise_std_options = [0.05, 0.06, 0.07, 0.08, 0.09] # Narrowed around the 0.07/0.08 sweet spot
        # channel_drop_options = [0.1, 0.12, 0.15, 0.18, 0.2]
        # time_mask_options = [8, 10, 15, 18, 25] 
        # aug_prob_options = [0.5, 0.6, 0.7, 0.8, 0.85] # SHIFTED UP
        
        # # Training variations
        # lr_options = [1e-5, 5e-5, 1e-4, 5e-4, 1e-3] # SHIFTED DOWN (due to early stopping issue)
        # wd_options = [1e-4, 5e-4, 1e-3, 5e-3, 1e-2] # SHIFTED UP
        # scheduler_options = ['plateau', 'step'] # Dropped cosine, plateau dominates
        
        # # Ensemble strategy variations
        # ensemble_strategies = ['median'] # median won 6/6 times
        # branch_drop_options = [0.0, 0.1, 0.15, 0.2]

        # # new config addition, only used for huber loss though
        # huber_delta_options = [0.5, 0.75, 1.0, 1.25, 1.5]

        # Version 3 updated hyperparameters
        multiscale_options = [True, False]
        channel_attn_options = [True, False]
        
        # Architecture variations
        num_branches_options = [6, 8, 10, 12, 14, 16] # Kept as is; good spread in top models
        hidden_dim_options = [48, 64, 80, 96, 112, 128] # Expanded both ways (hit 64 and 112 in top 5)
        d_model_options = [128, 160, 192, 224, 256] # Dropped 96 (rarely top), shifted up
        
        # Regularization
        dropout_options = [0.55, 0.60, 0.65, 0.70] # Narrowed around the 0.6-0.65 sweet spot
        branch_drop_options = [0.0, 0.05, 0.1, 0.15, 0.2] # Added 0.05, kept bounds
        
        # Augmentation variations
        noise_std_options = [0.05, 0.06, 0.07, 0.08, 0.09] # Kept as is; top models spanned 0.05 to 0.09
        channel_drop_options = [0.05, 0.08, 0.1, 0.12, 0.15] # SHIFTED DOWN (0.1 was heavily favored)
        time_mask_options = [8, 10, 15, 18, 25] # Kept as is; highly variable in top models
        aug_prob_options = [0.75, 0.80, 0.85, 0.90, 0.95] # SHIFTED UP (0.85 was the ceiling and dominated)
        
        # Training variations
        lr_options = [5e-5, 1e-4, 5e-4, 1e-3, 2e-3] # Adjusted slightly to favor the higher end that worked
        wd_options = [1e-5, 5e-5, 1e-4, 5e-4, 1e-3] # SHIFTED DOWN (1e-4 was the floor and dominated)
        scheduler_options = ['plateau'] # Dropped step, plateau clearly dominates
        
        # Ensemble strategy variations
        ensemble_strategies = ['median'] # median is the clear winner
        
        # Loss config
        huber_delta_options = [0.1, 0.25, 0.5, 0.75, 1.0] # SHIFTED DOWN (0.5 was the floor and highly ranked)
        
        import random as rnd
        rnd.seed(base_seed)
        
        for i in range(num_models):
            # Create unique seed for each model
            model_seed = base_seed + i * 1000
            
            # Randomly sample configuration
            config = ModelConfig(
                name=f"model_{i:03d}",
                seed=model_seed,
                
                # Architecture
                use_multiscale=rnd.choice(multiscale_options),
                use_channel_attention=rnd.choice(channel_attn_options),
                num_branches=rnd.choice(num_branches_options),
                branch_hidden_dim=rnd.choice(hidden_dim_options),
                d_model=rnd.choice(d_model_options),
                dropout=rnd.choice(dropout_options),
                
                # Augmentation
                aug_noise_std=rnd.choice(noise_std_options),
                aug_channel_drop=rnd.choice(channel_drop_options),
                aug_time_mask_len=rnd.choice(time_mask_options),
                aug_prob=rnd.choice(aug_prob_options),
                amp_scale_range=(
                    0.7 + rnd.random() * 0.2,  # min: 0.7-0.9
                    1.1 + rnd.random() * 0.4   # max: 1.1-1.5
                ),
                
                # Training
                learning_rate=rnd.choice(lr_options),
                weight_decay=rnd.choice(wd_options),
                scheduler_type=rnd.choice(scheduler_options),
                
                # Ensemble
                ensemble_strategy=rnd.choice(ensemble_strategies),
                branch_drop_rate=rnd.choice(branch_drop_options),

                # Huber loss transition point
                huber_delta=rnd.choice(huber_delta_options)
            )
            
            configs.append(config)
        
        return configs
    
    @staticmethod
    def generate_targeted_configs(num_models: int, base_seed: int = 42) -> List[ModelConfig]:
        """Generate configs targeting different model capacities and regularizations."""
        configs = []
        
        # Strategy 1: Small, heavily regularized models (1/3 of ensemble)
        num_small = num_models // 3
        for i in range(num_small):
            configs.append(ModelConfig(
                name=f"small_reg_{i:03d}",
                seed=base_seed + i,
                use_multiscale=True,
                use_channel_attention=True,
                num_branches=12 + i % 8,  # 12-19
                branch_hidden_dim=32 + (i % 3) * 8,  # 32, 40, 48
                d_model=96,
                dropout=0.45 + (i % 5) * 0.02,  # 0.45-0.53
                aug_noise_std=0.07 + (i % 4) * 0.01,
                aug_channel_drop=0.15 + (i % 3) * 0.02,
                aug_time_mask_len=20 + i % 10,
                aug_prob=0.6,
                amp_scale_range=(0.75, 1.3),
                learning_rate=1e-3,
                weight_decay=5e-4,
                scheduler_type='cosine',
                ensemble_strategy='mean',
                branch_drop_rate=0.15,
                huber_delta=1.0,
            ))
        
        # Strategy 2: Medium capacity, balanced (1/3 of ensemble)
        num_medium = num_models // 3
        for i in range(num_medium):
            configs.append(ModelConfig(
                name=f"medium_{i:03d}",
                seed=base_seed + 10000 + i,
                use_multiscale=i % 2 == 0,
                use_channel_attention=True,
                num_branches=8 + i % 6,  # 8-13
                branch_hidden_dim=48 + (i % 4) * 8,  # 48, 56, 64, 72
                d_model=128,
                dropout=0.35 + (i % 5) * 0.02,  # 0.35-0.43
                aug_noise_std=0.05 + (i % 5) * 0.01,
                aug_channel_drop=0.1 + (i % 4) * 0.02,
                aug_time_mask_len=15 + i % 10,
                aug_prob=0.5,
                amp_scale_range=(0.8, 1.25),
                learning_rate=5e-4 if i % 2 == 0 else 1e-3,
                weight_decay=1e-4,
                scheduler_type='cosine' if i % 3 != 0 else 'step',
                ensemble_strategy='median' if i % 2 == 0 else 'mean',
                branch_drop_rate=0.1,
                huber_delta=1.0,
            ))
        
        # Strategy 3: Larger, less regularized models (1/3 of ensemble)
        num_large = num_models - num_small - num_medium
        for i in range(num_large):
            configs.append(ModelConfig(
                name=f"large_{i:03d}",
                seed=base_seed + 20000 + i,
                use_multiscale=True,
                use_channel_attention=i % 3 != 0,
                num_branches=6 + i % 4,  # 6-9
                branch_hidden_dim=64 + (i % 3) * 16,  # 64, 80, 96
                d_model=160 + (i % 2) * 32,  # 160 or 192
                dropout=0.25 + (i % 6) * 0.02,  # 0.25-0.35
                aug_noise_std=0.04 + (i % 4) * 0.01,
                aug_channel_drop=0.08 + (i % 3) * 0.02,
                aug_time_mask_len=12 + i % 8,
                aug_prob=0.4,
                amp_scale_range=(0.85, 1.2),
                learning_rate=3e-4 if i % 2 == 0 else 5e-4,
                weight_decay=5e-5,
                scheduler_type='plateau' if i % 3 == 0 else 'cosine',
                ensemble_strategy='trimmed_mean',
                branch_drop_rate=0.05,
                huber_delta=1.0,
            ))
        
        return configs


def create_model_from_config(config: ModelConfig, in_channels: int = 128, 
                            seq_len: int = 200, num_outputs: int = 4) -> CNNEnsemble:
    """Create a CNNEnsemble model from configuration."""
    model = CNNEnsemble(
        in_channels=in_channels,
        seq_len=seq_len,
        d_model=config.d_model,
        num_outputs=num_outputs,
        dropout=config.dropout,
        num_branches=config.num_branches,
        branch_hidden_dim=config.branch_hidden_dim,
        use_augmentation=True,
        use_multiscale=config.use_multiscale,
        use_channel_attention=config.use_channel_attention,
        ensemble_strategy=config.ensemble_strategy,
        branch_drop_rate=config.branch_drop_rate,
    )
    
    # Customize augmentation
    if hasattr(model, 'augmentation'):
        model.augmentation.noise_std = config.aug_noise_std
        model.augmentation.channel_drop_prob = config.aug_channel_drop
        model.augmentation.time_mask_len = config.aug_time_mask_len
        model.augmentation.aug_prob = config.aug_prob
        model.augmentation.amp_scale_range = config.amp_scale_range
    
    return model