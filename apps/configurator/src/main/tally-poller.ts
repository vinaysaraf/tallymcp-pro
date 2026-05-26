import type { TallyStatus } from "../shared/ipc-types.js";

const LIST_COMPANIES_XML = `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>List of Companies</ID></HEADER><BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES><TDL><TDLMESSAGE><COLLECTION NAME="List of Companies" ISMODIFY="No"><TYPE>Company</TYPE></COLLECTION></TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;

const COMPANY_NAME_RE = /<COMPANY\b[^>]*NAME="([^"]+)"/i;

export interface ProbeOptions {
  url: string;
  fetcher?: typeof fetch;
}

export async function probeTallyOnce(opts: ProbeOptions): Promise<TallyStatus> {
  const fetcher = opts.fetcher ?? fetch;
  try {
    const resp = await fetcher(opts.url, {
      method: "POST",
      headers: { "Content-Type": "text/xml" },
      body: LIST_COMPANIES_XML,
      // Caller is responsible for AbortController if they want timeouts
    });
    if (resp.status !== 200) {
      return { reachable: false, probedAt: Date.now() };
    }
    const text = await resp.text();
    const match = text.match(COMPANY_NAME_RE);
    return {
      reachable: true,
      companyName: match?.[1],
      probedAt: Date.now(),
    };
  } catch {
    return { reachable: false, probedAt: Date.now() };
  }
}

export interface PollerOptions extends ProbeOptions {
  intervalMs: number;
  onStatus: (status: TallyStatus) => void;
}

export interface Poller {
  start: () => void;
  stop: () => void;
}

export function createTallyPoller(opts: PollerOptions): Poller {
  let handle: ReturnType<typeof setInterval> | undefined;
  let stopped = false;

  const tick = async (): Promise<void> => {
    if (stopped) return;
    const status = await probeTallyOnce({ url: opts.url, fetcher: opts.fetcher });
    if (!stopped) opts.onStatus(status);
  };

  return {
    start: () => {
      stopped = false;
      void tick(); // immediate first probe
      handle = setInterval(() => void tick(), opts.intervalMs);
    },
    stop: () => {
      stopped = true;
      if (handle !== undefined) clearInterval(handle);
    },
  };
}
