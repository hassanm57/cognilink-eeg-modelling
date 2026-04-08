import torch
import torch.nn as nn

class EEGNeX(nn.Module):
    def __init__(self, n_channels=128, n_times=200):
        super().__init__()

        # Temporal convolution
        self.temporal = nn.Sequential(
            nn.Conv2d(1, 16, kernel_size=(1, 25), padding=(0, 12)),
            nn.BatchNorm2d(16),
            nn.ELU()
        )

        # Spatial convolution
        self.spatial = nn.Sequential(
            nn.Conv2d(16, 32, kernel_size=(n_channels, 1)),
            nn.BatchNorm2d(32),
            nn.ELU()
        )

        self.pool = nn.AdaptiveAvgPool2d((1, 1))

        # Regression head (4 traits)
        self.fc = nn.Linear(32, 4)

    def forward(self, x):
        # x: (B, 1, Channels, Time)
        x = self.temporal(x)
        x = self.spatial(x)
        x = self.pool(x)
        x = x.view(x.size(0), -1)
        return self.fc(x)
