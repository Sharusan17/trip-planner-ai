interface Props {
  tip: string | null | undefined;
}

/** Amber contextual tip box shown when a holiday-type-specific tip is available. */
export default function SetupTip({ tip }: Props) {
  if (!tip) return null;
  return (
    <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-900">
      <span className="text-base leading-none flex-shrink-0">💡</span>
      <span>{tip}</span>
    </div>
  );
}
