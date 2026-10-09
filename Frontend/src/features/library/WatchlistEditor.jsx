import { useState } from "react";
import { localToday } from "../../shared/localDate";

function WatchlistEditor({ entry, busy, onSave, onClose }) {
  const [conflict, setConflict] = useState(false);
  const [status, setStatus] = useState(entry.watch_status);
  const [watchedAt, setWatchedAt] = useState(entry.watched_at?.slice(0, 10) || "");
  const [rating, setRating] = useState(entry.personal_rating?.toString() || "");
  const [notes, setNotes] = useState(entry.notes || "");

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (conflict) return;
    const saved = await onSave(entry.tmdb_id, {
      watch_status: status,
      watched_at: status === "watched" ? (watchedAt || null) : null,
      personal_rating: status === "watched" && rating ? Number(rating) : null,
      notes: notes.trim() || null,
    }, entry.version);
    if (saved === "conflict") setConflict(true);
    else if (saved) onClose();
  };

  return (
    <form className="watchlist-editor" onSubmit={handleSubmit}>
      <label>
        Estado
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="want_to_watch">Quero assistir</option>
          <option value="watched">Assistido</option>
        </select>
      </label>
      {status === "watched" && (
        <>
          <label>
            Data em que assistiu
            <input
              type="date"
              value={watchedAt}
              max={localToday()}
              onChange={(event) => setWatchedAt(event.target.value)}
            />
          </label>
          <label>
            Minha nota
            <select value={rating} onChange={(event) => setRating(event.target.value)}>
              <option value="">Sem nota</option>
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>{value}/5</option>
              ))}
            </select>
          </label>
        </>
      )}
      <label>
        Comentário pessoal
        <textarea
          value={notes}
          maxLength={1000}
          rows={4}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="O que você achou?"
        />
      </label>
      <div className="editor-actions">
        {conflict && <p className="form-error" role="status">Seu rascunho não foi salvo. Copie o que desejar antes de fechar e reabra a edição para revisar o registro atualizado.</p>}
        <button type="submit" className="primary-button" disabled={busy || conflict}>
          {busy ? "Salvando..." : "Salvar registro"}
        </button>
        <button type="button" className="secondary-button" onClick={onClose} disabled={busy}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export default WatchlistEditor;
