export type MemorySearchInput = {
  query: string;
  limit?: number;
};

export type MemorySearchResult = {
  matches: Array<{
    id: string;
    title: string;
    summary: string;
  }>;
  warning?: string;
};

export async function searchProductMemory(input: MemorySearchInput): Promise<MemorySearchResult> {
  return {
    matches: [],
    warning: `MongoDB MCP memory search is planned but not implemented in this skeleton. Query: ${input.query}`,
  };
}
