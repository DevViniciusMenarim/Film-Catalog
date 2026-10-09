import { useCallback, useEffect, useRef, useState } from "react";

export function useMovieDetails(api) {
  const [movie, setMovie] = useState(null);
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const requestRef = useRef(null);

  const open = useCallback(async (nextMovie) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setMovie(nextMovie);
    setDetails(null);
    setError(null);
    setLoading(true);
    try {
      const loaded = await api.getMovieDetails(nextMovie.id, { signal: controller.signal });
      if (requestRef.current === controller) setDetails(loaded);
    } catch {
      if (!controller.signal.aborted && requestRef.current === controller) {
        setError("Falha ao carregar os detalhes do filme.");
      }
    } finally {
      if (requestRef.current === controller) setLoading(false);
    }
  }, [api]);

  const close = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    setMovie(null);
  }, []);

  useEffect(() => () => requestRef.current?.abort(), []);

  return { movie, details, loading, error, open, close, retry: () => movie && open(movie) };
}
