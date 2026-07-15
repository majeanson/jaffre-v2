/** Owns the pre-game placeholder shown until the first view arrives. */
export function WaitingScreen() {
  return (
    <main className="table-felt grid min-h-screen place-items-center">
      <p className="animate-pulse text-(--color-ivory)/70">Waiting for the game…</p>
    </main>
  );
}
