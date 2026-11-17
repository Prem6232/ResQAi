import { liveApi, mockApi } from "./mock-api";

export * from "./mock-api";
export const api = liveApi;
export { mockApi };
export default liveApi;
