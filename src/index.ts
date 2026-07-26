/** Public surface, for anything importing this package rather than running it. */
export { analyze, resolveMode, type AnalyzeOptions } from './analyze.js'
export {
  callBackend,
  DEFAULT_ENDPOINT,
  ENDPOINT_ENV_VAR,
  resolveEndpoint,
  type BackendCallOptions,
  type BackendRequest,
  type ProgressEvent,
  type ProgressListener,
} from './backend.js'
export { errorMessage, UnavailableError } from './errors.js'
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
