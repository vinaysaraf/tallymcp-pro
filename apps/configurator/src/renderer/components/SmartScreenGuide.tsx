export interface SmartScreenGuideProps {
  onClose: () => void;
}

export function SmartScreenGuide({ onClose }: SmartScreenGuideProps): JSX.Element {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Windows SmartScreen guide"
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-tm-bg rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-tm-border">
        <div className="bg-tm-card border-b border-tm-border px-5 py-3 font-semibold">
          Windows might show a warning — here's what to do
        </div>
        <div className="p-6 text-sm text-tm-text">
          <div className="text-tm-text-muted text-center mb-6">
            The first time you run TallyMCP, Windows will show one safety warning because we use a
            free certificate. It takes <strong>two clicks</strong> to continue — here they are:
          </div>

          {/* Step 1 */}
          <div className="flex items-start gap-4 mb-7">
            <div className="bg-tm-blue text-white w-8 h-8 rounded-full flex items-center justify-center font-semibold flex-shrink-0">
              1
            </div>
            <div className="flex-1">
              <div className="font-semibold mb-1.5">You'll see this blue screen</div>
              <div className="text-xs text-tm-text-muted mb-2">
                Click the small <strong>"More info"</strong> link.
              </div>
              <div className="bg-[#0078d4] text-white p-5 rounded max-w-md">
                <div className="font-semibold text-lg mb-1.5">Windows protected your PC</div>
                <div className="text-xs opacity-95 mb-4">
                  Microsoft Defender SmartScreen prevented an unrecognized app from starting.
                </div>
                <div className="text-xs mb-4">
                  <strong>App:</strong> TallyMCP-Setup.exe
                  <br />
                  <strong>Publisher:</strong> Unknown publisher
                </div>
                <span className="underline text-sm">More info</span>
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex items-start gap-4 mb-6">
            <div className="bg-tm-blue text-white w-8 h-8 rounded-full flex items-center justify-center font-semibold flex-shrink-0">
              2
            </div>
            <div className="flex-1">
              <div className="font-semibold mb-1.5">A new button appears — click "Run anyway"</div>
              <div className="text-xs text-tm-text-muted mb-2">
                After clicking "More info", a <strong>"Run anyway"</strong> button shows up at the
                bottom. Click it once and you're done forever.
              </div>
              <div className="bg-[#0078d4] text-white p-5 rounded max-w-md">
                <div className="font-semibold text-lg mb-1.5">Windows protected your PC</div>
                <div className="text-xs opacity-95 mb-3">
                  Microsoft Defender SmartScreen prevented an unrecognized app from starting.
                </div>
                <div className="flex gap-2">
                  <div className="bg-white text-black px-5 py-1 rounded text-xs font-medium">
                    Run anyway
                  </div>
                  <div className="border border-white px-5 py-1 rounded text-xs">Don't run</div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-tm-green-soft border border-tm-green-deep p-3 rounded mb-4">
            <div className="font-semibold text-tm-green-deep mb-1">✓ That's it — only once</div>
            <div>Windows remembers your choice for this app.</div>
          </div>

          <div className="flex justify-end mt-6 pt-3 border-t border-tm-border">
            <button
              type="button"
              onClick={onClose}
              className="bg-tm-blue text-white py-2 px-5 rounded font-medium hover:opacity-90"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
