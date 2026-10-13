import { useEffect, useRef, useState } from 'react';
import { FileUp, X, ArrowRight } from 'lucide-react';
import { MAX_BYTES, parsePlan } from '../lib/plan';
interface Props {
  mode: 'baseline' | 'comparison';
  onClose: () => void;
  onImport: (name: string, input: string) => void;
}
export function ImportDialog({ mode, onClose, onImport }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [input, setInput] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const load = async (file?: File) => {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError('File is larger than 2 MB. Choose a smaller plan.');
      return;
    }
    try {
      setInput(await file.text());
      setName(file.name.replace(/\.json$/i, ''));
      setError('');
    } catch {
      setError('Unable to read this file. Try pasting the JSON instead.');
    }
  };
  return (
    <dialog
      className="import-dialog"
      ref={dialog}
      onCancel={onClose}
      aria-labelledby="import-title"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          try {
            parsePlan(input);
            onImport(name.trim() || 'Imported query', input);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Unable to parse plan.');
          }
        }}
      >
        <div className="dialog-head">
          <div>
            <p className="eyebrow">YOUR DATABASE. YOUR BROWSER.</p>
            <h2 id="import-title">
              {mode === 'comparison' ? 'Import comparison plan' : 'Import query plan'}
            </h2>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close import dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <p className="muted">
          Paste JSON output from PostgreSQL or upload a plan file. Nothing is sent to a server.
        </p>
        <label className="field-label" htmlFor="analysis-name">
          Analysis name
        </label>
        <input
          id="analysis-name"
          placeholder="e.g. Orders · before indexing"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
        />
        <div className="textarea-label">
          <label className="field-label" htmlFor="plan-json">
            EXPLAIN JSON
          </label>
          <label className="file-upload">
            <FileUp size={15} /> Upload JSON
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                void load(e.target.files?.[0]);
              }}
            />
          </label>
        </div>
        <textarea
          id="plan-json"
          placeholder={'[\n  { "Plan": { "Node Type": "Seq Scan", ... } }\n]'}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            if (error) setError('');
          }}
          spellCheck={false}
          aria-describedby={error ? 'import-error' : 'json-help'}
        />
        <p id="json-help" className="input-help">
          Single statement · JSON only · Up to 2 MB
        </p>
        {error ? (
          <p className="form-error" id="import-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="dialog-command">
          <span>Capture a plan</span>
          <code>EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT ...;</code>
          <small>
            ANALYZE executes the statement in your database. PlanScope only reads its output.
          </small>
        </div>
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-button" type="submit">
            Analyze plan <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </dialog>
  );
}
