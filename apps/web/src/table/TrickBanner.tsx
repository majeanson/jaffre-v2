export interface TrickBannerProps {
  readonly text: string;
  /** True when the trick contained a special card (bigger burst animation). */
  readonly special: boolean;
}

/** Owns the "X takes the trick" pill at the bottom of the stage. */
export function TrickBanner({ text, special }: TrickBannerProps) {
  return (
    <p
      className={`absolute bottom-[2%] left-1/2 z-10 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-center text-xs font-semibold text-(--color-lamplight) ${
        special ? 'special-burst' : 'pop-in'
      }`}
    >
      {text}
    </p>
  );
}
