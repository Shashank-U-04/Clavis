/** What an agent connected over MCP can do, for the app and the docs (server/mcp/tools.ts has the tools themselves). */

export const MCP_TOOLS: [string, string][] = [
  ["list_plans", "your plans, newest first"],
  ["get_plan", "one plan in full: floors, rooms, walls, doors, windows, furniture, checks"],
  ["check_plan", "run the checks: sizes, doors, clearances, routes, walkability"],
  ["create_plan", "a new plan from a template, a one-line brief, or empty"],
  ["apply_operations", "edit a plan with the studio's own checked operations"],
  ["describe_operations", "every operation and its fields"],
  ["list_catalog", "the furniture and building pieces, with sizes"],
  ["list_templates", "the templates a plan can start from"],
];
