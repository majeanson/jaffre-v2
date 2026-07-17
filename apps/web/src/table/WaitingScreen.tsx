/** Owns the pre-game placeholder shown until the first view arrives. */
export function WaitingScreen() {
  return (
    <main className="table-felt grid min-h-screen place-items-center">
      <p className="animate-pulse font-arcade-display uppercase tracking-wide text-(--color-ap-muted)">
        Waiting for the game…
      </p>
    </main>
  );
}
