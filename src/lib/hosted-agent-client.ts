export type HostedAgentResult = {
  ok: true;
  runtime: string;
  processedRunIds: string[];
  processedCount: number;
};

export type HostedAgentConfig = {
  url: string;
  secret: string;
};

export function getHostedAgentConfig(): HostedAgentConfig | null {
  const url = process.env.AGENT_WORKER_URL?.trim();
  if (!url) return null;
  const secret = process.env.AGENT_WORKER_SECRET?.trim();
  if (!secret) {
    throw new Error("AGENT_WORKER_URL is set but AGENT_WORKER_SECRET is missing. Check Vercel environment variables.");
  }
  return { url, secret };
}

export async function callHostedAgent(config: HostedAgentConfig, runId: string): Promise<HostedAgentResult> {
  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.secret}`,
    },
    body: JSON.stringify({ runId }),
  });

  if (!response.ok) {
    throw new Error(`Hosted agent returned HTTP ${response.status}.`);
  }

  return response.json() as Promise<HostedAgentResult>;
}
