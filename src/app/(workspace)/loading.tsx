/** Route-level loading skeleton for the workspace shell. */
export default function WorkspaceLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-live="polite">
      <div className="flex items-end justify-between gap-4">
        <div className="flex-1">
          <div className="skeleton h-3 w-40" />
          <div className="skeleton mt-2 h-8 w-64" />
        </div>
      </div>
      <div className="skeleton h-40 w-full" />
      <div className="skeleton h-72 w-full" />
    </div>
  );
}
