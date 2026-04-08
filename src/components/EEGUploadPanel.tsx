import { useState, useRef } from "react";
import { Upload, FileText, X, Loader2, CheckCircle, AlertCircle, Pencil, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EEG_TASKS, EEG_MODELS, type EEGTaskId, type EEGModelId } from "@/services/eegInference";
import { type InferenceStatus } from "@/hooks/useEEGInference";

function detectTaskFromFilename(filename: string): EEGTaskId | null {
  const match = filename.match(/task-([^_.]+)/i);
  if (!match) return null;
  const raw = match[1].toLowerCase();
  for (const task of EEG_TASKS) {
    if (task.id.toLowerCase() === raw) return task.id;
  }
  return null;
}

interface EEGUploadPanelProps {
  status: InferenceStatus;
  progress: number;
  error: string | null;
  onSubmit: (file: File, taskName: EEGTaskId, modelName: EEGModelId, age?: number, sex?: string, label?: string) => void;
  onReset: () => void;
}

const EEGUploadPanel = ({ status, progress, error, onSubmit, onReset }: EEGUploadPanelProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [patientLabel, setPatientLabel] = useState("");
  const [taskName, setTaskName] = useState<EEGTaskId>("RestingState");
  const [modelName, setModelName] = useState<EEGModelId>("LabRaM");
  const [subjectAge, setSubjectAge] = useState("");
  const [subjectSex, setSubjectSex] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [showOptional, setShowOptional] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const setFileWithLabel = (f: File) => {
    setFile(f);
    // Auto-populate label from filename (strip .bdf extension)
    setPatientLabel(f.name.replace(/\.bdf$/i, ""));
    // Auto-detect task from filename (e.g. task-RestingState or task-contrastChangeDetection)
    const detected = detectTaskFromFilename(f.name);
    if (detected) setTaskName(detected);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.name.endsWith(".bdf")) {
      setFileWithLabel(droppedFile);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) setFileWithLabel(selectedFile);
  };

  const handleSubmit = () => {
    if (!file) return;
    onSubmit(
      file,
      taskName,
      modelName,
      subjectAge ? parseInt(subjectAge) : undefined,
      subjectSex || undefined,
      patientLabel.trim() || file.name,
    );
  };

  const handleReset = () => {
    setFile(null);
    setPatientLabel("");
    setSubjectAge("");
    setSubjectSex("");
    setShowOptional(false);
    onReset();
  };

  const isProcessing = status === "uploading" || status === "processing" || status === "analyzing";

  return (
    <div className="p-6 rounded-2xl bg-card border border-border">
      <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
        <Upload className="w-5 h-5 text-primary" />
        EEG File Upload & Inference
      </h2>

      {status === "complete" ? (
        <div className="text-center py-6">
          <CheckCircle className="w-12 h-12 text-neural-green mx-auto mb-3" style={{ color: "hsl(var(--neural-green))" }} />
          <p className="font-medium mb-1">Inference Complete</p>
          <p className="text-sm text-muted-foreground mb-4">Results are displayed below</p>
          <Button variant="outline" onClick={handleReset}>
            Upload Another File
          </Button>
        </div>
      ) : status === "error" ? (
        <div className="text-center py-6">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-3" />
          <p className="font-medium mb-1">Inference Failed</p>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <Button variant="outline" onClick={handleReset}>
            Try Again
          </Button>
        </div>
      ) : isProcessing ? (
        <div className="py-6">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
            <span className="font-medium">
              {status === "uploading" ? "Uploading EEG file..." : status === "analyzing" ? "AI analyzing diagnosis..." : "Running model inference..."}
            </span>
          </div>
          <div className="h-3 rounded-full bg-muted overflow-hidden mb-2">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground text-center">{progress}% complete</p>
          {status === "processing" && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              EEGNeX model is analyzing 128-channel EEG data...
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
              isDragging
                ? "border-primary bg-primary/5"
                : file
                ? "border-primary/40 bg-primary/5"
                : "border-border hover:border-primary/40 hover:bg-secondary/50"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".bdf"
              onChange={handleFileSelect}
              className="hidden"
            />
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileText className="w-8 h-8 text-primary" />
                <div className="text-left">
                  <p className="font-medium">{file.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {(file.size / (1024 * 1024)).toFixed(1)} MB
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setFile(null); setPatientLabel(""); }}
                  className="ml-4 p-1 rounded-full hover:bg-secondary"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            ) : (
              <>
                <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-medium mb-1">Drop your .bdf file here</p>
                <p className="text-sm text-muted-foreground">
                  or click to browse • HBN-EEG format, 128 channels, 100 Hz
                </p>
              </>
            )}
          </div>

          {/* Patient label — shown once a file is selected */}
          {file && (
            <div>
              <label className="text-sm font-medium mb-2 block flex items-center gap-1.5">
                <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                Patient Name / Label
              </label>
              <input
                type="text"
                value={patientLabel}
                onChange={(e) => setPatientLabel(e.target.value)}
                placeholder="Enter patient name or identifier"
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm focus:outline-none focus:border-primary"
              />
            </div>
          )}

          {/* Model selection */}
          <div>
            <label className="text-sm font-medium mb-2 block">Inference Model</label>
            <select
              value={modelName}
              onChange={(e) => setModelName(e.target.value as EEGModelId)}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm focus:outline-none focus:border-primary"
            >
              {EEG_MODELS.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>
          </div>

          {/* Task selection */}
          <div>
            <label className="text-sm font-medium mb-2 flex items-center gap-2">
              EEG Task
              {file && detectTaskFromFilename(file.name) && (
                <span className="text-xs font-normal text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                  auto-detected
                </span>
              )}
            </label>
            <select
              value={taskName}
              onChange={(e) => setTaskName(e.target.value as EEGTaskId)}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm focus:outline-none focus:border-primary"
            >
              {EEG_TASKS.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.label}
                </option>
              ))}
            </select>
          </div>

          {/* Optional demographics — collapsible */}
          <div className="rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setShowOptional((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-secondary/50 hover:bg-secondary transition-colors text-sm font-medium"
            >
              <span className="text-muted-foreground">Optional</span>
              {showOptional
                ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                : <ChevronRight className="w-4 h-4 text-muted-foreground" />
              }
            </button>
            {showOptional && (
              <div className="grid grid-cols-2 gap-3 p-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Age</label>
                  <input
                    type="number"
                    value={subjectAge}
                    onChange={(e) => setSubjectAge(e.target.value)}
                    placeholder="e.g. 25"
                    className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Sex</label>
                  <select
                    value={subjectSex}
                    onChange={(e) => setSubjectSex(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm focus:outline-none focus:border-primary"
                  >
                    <option value="">Not specified</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Submit */}
          <Button
            variant="neural"
            className="w-full"
            onClick={handleSubmit}
            disabled={!file}
          >
            <Upload className="w-4 h-4" />
            Run Inference
          </Button>
        </div>
      )}
    </div>
  );
};

export default EEGUploadPanel;
