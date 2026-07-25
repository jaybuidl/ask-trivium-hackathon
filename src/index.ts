/** Public surface, for anything importing this package rather than running it. */
export {
  analyze,
  errorMessage,
  resolveMode,
  UnavailableError,
  type AnalyzeOptions,
} from './analyze.js'
export {
  AnalyzeDisputeInput,
  Flags,
  MODES,
  PANEL_SIZE,
  PanelEntry,
  PanelResponse,
  PERSONAS,
  Verdict,
  type Mode,
} from './contract.js'
export { MOCK_DISPUTE_TITLE, MOCK_PANEL } from './fixture.js'
export { createServer, startStdioServer } from './mcp.js'
export { renderPanel } from './render.js'
