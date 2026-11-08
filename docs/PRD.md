# CLAVIS — Full Product Requirements Document & Implementation Specification

**Project:** Clavis  
**Category:** AI-native architectural design studio  
**Hackathon:** Meta Global AI Developer Hackathon 2026  
**Track:** Indie Developer  
**Team name:** Clavis  
**Primary theme:** Push the Frontier  
**Project type:** Web application with an agent-native 2D/3D architectural editor  
**Deadline:** November 4, 2026, 9:00 PM ET / November 5, 2026, 7:30 AM IST  
**Document purpose:** Give the coding agent sufficient context to implement a coherent product, validate the results, and prepare the final hackathon submission.

---

# 1. MASTER INSTRUCTION TO THE CODING AGENT

You are the principal software engineer, architecture lead, AI integration engineer, QA engineer, and technical product owner for Clavis.

Your task is to deliver a functioning, polished, technically credible AI-native architectural design studio within the available hackathon period.

Your goal is one integrated product with one authoritative architectural model, one consistent geometry engine, one agent interaction layer, and one cohesive user experience.

## Non-negotiable engineering rules

1. Inspect before implementing. Establish what already works and what is incomplete.
2. Keep one codebase and one source of truth.
3. Preserve working features and existing conventions unless there is a documented reason to change them.
4. Use a single canonical building model shared by human interaction, AI operations, validation, and 3D rendering.
5. Geometry calculations and constraint validation must be deterministic. The LLM must not be the authority for dimensions or geometric correctness.
6. Integrate Meta AI meaningfully. Do not create a superficial API call solely to satisfy the hackathon.
7. Do not claim an operation succeeded until its result has been validated.
8. Keep changes incremental, testable, and reversible.
9. Do not introduce unnecessary infrastructure, databases, microservices, or dependencies.
10. Never expose API keys, secrets, private environment variables, or internal credentials to the browser or Git repository.
11. Respect the licenses of all dependencies.
12. Do not deploy, modify production infrastructure, overwrite remote repositories, or perform destructive database operations without explicit authorization.
13. Do not invent working functionality, successful tests, model results, performance measurements, or deployment status.
14. Prioritize a complete and reliable end-to-end workflow over a large collection of unfinished features.

**Definition of success:** A user can describe a space in natural language, generate or modify an actual architectural model, inspect it in synchronized 2D and 3D, validate its geometry, furnish it with correctly sized objects, and receive a useful explanation from a Meta model.

# 2. PRODUCT VISION

## 2.1 Product one-liner

Clavis is an AI-native architectural design studio that transforms natural-language instructions into interactive 2D floor plans, constraint-validated layouts, and immersive 3D spaces with real-scale furniture placement.

## 2.2 Product vision

Make architectural concept design accessible through collaboration between people and AI agents.

A user should be able to describe an idea, inspect the resulting plan, make corrections visually or conversationally, and understand whether the resulting layout satisfies the system's measurable spatial constraints.

Unlike a generic AI floor-plan generator, Clavis should provide a persistent, editable architectural model. Every operation—whether performed by a user or an AI agent—must modify the same underlying design.

## 2.3 Core differentiator

**Natural-language architectural design with deterministic geometric verification and synchronized 2D/3D interaction.**

The system must connect five capabilities into one workflow:

1. Understand user requirements.
2. Translate them into structured architectural operations.
3. Apply the operations to a canonical model.
4. Validate the resulting geometry.
5. Explain the changes and expose them visually.

## 2.4 Target users

- Students and individuals exploring home layouts.
- People developing preliminary residential concepts.
- Designers seeking rapid spatial alternatives.
- AI agents that need structured tools to inspect and modify architectural models.

Clavis is an early-stage concept-design tool. It must not claim to replace licensed architects, structural engineers, building-code authorities, or professional construction documentation.

# 3. HACKATHON STRATEGY

The product must demonstrate technical ambition while remaining achievable in the available time.

## Required demonstration

A user enters:

"Design a compact two-bedroom home with an open kitchen and living area, one bathroom, a study corner, and enough space to move comfortably between rooms."

The application must:

1. Parse the request into structured requirements.
2. Generate or modify a valid architectural model.
3. Display the resulting floor plan.
4. Render the same model in 3D.
5. Detect a deliberately introduced spatial conflict.
6. Propose a correction and validate the corrected model.
7. Allow furniture placement with real dimensions.
8. Generate a structured design explanation using Meta AI.
9. Allow the user to inspect the final design and its validation results.

The exact sample dimensions must be configurable and should not be presented as universally compliant with local building codes.

## Product principles

- Geometry before generated prose.
- Evidence before AI explanations.
- Human control over consequential changes.
- One source of truth for the entire design.
- Clear distinction between verified facts and AI suggestions.
- Useful failure states instead of fabricated success.
- Visual quality without sacrificing engineering reliability.

# 5. PRODUCT SCOPE

## 5.1 P0 — Required for the hackathon MVP

- Working application shell and architectural workspace.
- Editable 2D floor-plan representation.
- Synchronized 3D rendering.
- Canonical architectural data model.
- Basic wall, room, door, and window operations.
- Undo and redo for supported operations.
- Natural-language architectural interaction.
- Structured AI tool calls.
- Deterministic geometry validation.
- Clear validation results.
- Furniture catalog with measurable dimensions.
- Furniture placement and collision checking.
- Meta Model API integration.
- Save and reload a design locally.
- Error handling and loading states.
- Basic automated tests.
- Deployable application and demonstrable workflow.

## 5.2 P1 — Add only after P0 is reliable

- Walk-through navigation.
- Room area summaries.
- Image-based floor-plan tracing with user calibration.
- Multiple alternative layouts.
- Design history and operation summaries.
- Exportable design summary.
- Improved furniture search and filters.
- Responsive layouts and accessibility refinements.
- Additional deterministic architectural checks.

## 5.3 Explicitly out of scope

Unless the entire P0 workflow is already reliable, do not implement:

- Full BIM or CAD interoperability.
- Production-ready construction drawings.
- Structural engineering or load-bearing analysis.
- Universal building-code compliance.
- Real-time multi-user collaborative editing.
- User accounts and a complex cloud persistence system.
- Payments, shopping carts, or furniture checkout.
- Thousands of manually curated furniture items.
- Custom model training.
- A proprietary 3D rendering engine.
- Unrestricted autonomous modifications.
- Multiple agents that duplicate the same responsibilities.
- Complex deployment infrastructure without a demonstrated need.

# 6. FUNCTIONAL REQUIREMENTS

## FR-01: Architectural workspace

The workspace must include:

- Application header and project controls.
- Central 2D editor.
- 3D preview.
- AI design assistant.
- Properties or inspector panel.
- Validation and issue summary.
- Furniture catalog access.

The layout may adapt to screen size, but all core functions must remain accessible.

Acceptance criteria:

- The application loads without uncaught exceptions.
- The user can create or open a design.
- The main workspace renders consistently.
- Empty, loading, error, and populated states are implemented.
- The interface never displays success for an operation that failed.

## FR-02: Canonical architectural model

Create one authoritative model containing the building, levels, rooms, walls, openings, furniture, and relevant metadata.

All editing operations must update this model through a shared operation pipeline.

The renderer must derive its representation from the model. Do not store independent 2D and 3D versions of the design.

Acceptance criteria:

- A wall edit appears in both views.
- Adding an opening updates the corresponding wall representation.
- Furniture placement updates both the plan and the 3D scene.
- Invalid operations are rejected or clearly marked.
- Reloading a saved design preserves supported geometry and dimensions.

## FR-03: 2D editor

Required operations:

- Create, select, move, and delete supported entities.
- Draw walls.
- Create and edit rooms.
- Add doors and windows to valid host walls.
- Inspect dimensions.
- Zoom, pan, and fit the drawing to the viewport.
- Snap to useful geometric increments.
- Select and inspect furniture.
- Undo and redo supported operations.

Do not permit an opening to silently exist outside its host wall.

Use a consistent unit system. Store geometry internally in metres. Convert to display units only at presentation boundaries.

Acceptance criteria:

- Supported editing actions update the canonical model.
- Entity selection is stable.
- Geometry does not change scale unexpectedly when zooming.
- Undo and redo restore previous valid states.
- Unsupported or invalid actions return actionable errors.

## FR-04: 3D renderer

Use the existing compatible Three.js implementation where possible.

Requirements:

- Generate walls, floors, openings, and furniture from the canonical model.
- Maintain consistent geometry and dimensions with the 2D view.
- Provide orbit, pan, and zoom controls.
- Support a useful default camera position.
- Handle lighting, materials, and object visibility.
- Dispose of replaced geometries and materials when appropriate.
- Avoid duplicate meshes when the model changes.
- Handle empty or invalid models without crashing.

Walk-through mode is a P1 feature.

Acceptance criteria:

- The same architectural model produces consistent 2D and 3D geometry.
- Editing a supported entity refreshes the renderer.
- Repeated edits do not cause unbounded scene duplication.
- Rendering errors are surfaced during development and testing.

## FR-05: Natural-language design assistant

The user can issue instructions such as:

- "Create a two-bedroom layout with an open kitchen."
- "Move the door to the other side of this wall."
- "Add a study desk beside the bedroom window."
- "Show me the total area of the rooms."
- "Find furniture that fits this living room."
- "Explain why this layout has a circulation problem."

The assistant must distinguish between:

1. Design-generation requests.
2. Edits to existing geometry.
3. Queries about the current model.
4. Validation requests.
5. Requests for explanations or recommendations.

The LLM should return structured intent or tool calls. Application code must validate every proposed operation before applying it.

Acceptance criteria:

- The assistant uses the current design as context.
- Operations reference stable entity IDs.
- Ambiguous destructive operations request clarification or confirmation.
- Unsupported requests receive honest explanations.
- The assistant never invents successful geometry changes.
- The user can inspect the effects of an operation.

## FR-06: Agent tool interface

Keep one consolidated set of tool definitions.

Potential tools include:

- `get_building_summary`
- `list_levels`
- `list_rooms`
- `get_entity`
- `get_room_dimensions`
- `get_room_area`
- `create_wall`
- `update_wall`
- `delete_wall`
- `create_room`
- `create_opening`
- `update_opening`
- `place_furniture`
- `move_furniture`
- `remove_furniture`
- `validate_layout`
- `get_validation_issues`
- `suggest_layout_changes`
- `get_design_summary`

Use actual tool names and schemas appropriate to the chosen implementation. The list is a proposed contract, not a claim that these functions already exist.

Every mutating operation must:

1. Validate its input schema.
2. Check entity references.
3. Check geometry preconditions.
4. Apply a change through the canonical operation pipeline.
5. Run relevant validation.
6. Return a structured success or failure result.
7. Include the resulting model revision or equivalent state identifier.

Prefer small, composable operations over a single unrestricted `execute_arbitrary_code` tool.

## FR-07: Deterministic constraint engine

The constraint engine is one of the most important product components.

Implement only checks that can be computed reliably from the available geometry.

Initial checks:

- Invalid dimensions.
- Invalid or degenerate wall geometry.
- Invalid room boundaries.
- Openings outside host walls.
- Openings extending beyond host-wall endpoints.
- Overlapping or intersecting entities where the geometry rules prohibit them.
- Furniture outside its intended room.
- Furniture collisions.
- Obstructed clearance regions where represented.
- Missing or inconsistent entity references.
- Invalid model relationships.

Classify issues by severity, for example:

- Error: the operation or geometry is invalid.
- Warning: a potential spatial issue requires review.
- Information: a measurement or design observation.

Do not claim full building-code compliance. If local code rules are implemented later, identify the jurisdiction, rule source, version, and limitations explicitly.

Acceptance criteria:

- The same model and rules produce the same validation results.
- The user can select an issue and inspect the relevant entities.
- A failed validation does not get reported as a successful repair.
- The model remains inspectable after an invalid proposed operation.
- A correction is revalidated before it is described as successful.

## FR-08: AI-assisted repair

The agent should propose fixes for detected spatial problems.

Workflow:

1. Run deterministic validation.
2. Retrieve the relevant issue details.
3. Ask the model to propose a structured set of permitted operations.
4. Validate the proposal.
5. Request confirmation for destructive or consequential changes.
6. Apply the approved operation sequence.
7. Re-run validation.
8. Compare the before and after results.
9. Explain which issues were resolved and which remain.

Do not let the LLM declare a problem fixed without checking the resulting geometry.

Acceptance criteria:

- The user sees the original issue.
- The proposed correction is reviewable.
- The system can reject a proposed correction.
- The resulting geometry is validated again.
- The final summary reflects actual validation output.

## FR-09: Furniture inventory

Build a useful initial inventory rather than pursuing a large item count at the expense of correctness.

Initial categories:

- Beds.
- Sofas.
- Chairs.
- Dining tables.
- Desks.
- Wardrobes.
- Shelving.
- Kitchen counters.
- Bathroom fixtures.

Each product must have a normalized record with:

- Stable ID.
- Name.
- Category.
- Width, depth, and height in metres.
- Price and currency, if available.
- Material and style metadata, if available.
- Preview image or 3D asset reference.
- Asset source and license information.
- Optional supplier and product URL.

The system must distinguish verified catalog values from estimated or missing values.

Furniture placement must use dimensions rather than image proportions alone.

Acceptance criteria:

- Users can browse and filter the available catalog.
- Furniture can be placed, rotated, moved, and removed.
- Placement is reflected in both views.
- Collision checks use the item's actual stored dimensions.
- Missing dimensions are not silently fabricated.
- External catalog links and assets comply with their source terms.

For the demo, aim for a coherent collection of approximately 20–40 usable objects if the existing repositories do not already provide a suitable inventory. Treat this as a target, not a reason to delay core functionality.

## FR-10: Image-based floor-plan tracing

This is an optional enhancement.


Otherwise, defer this feature until the core editor is stable.

If implemented:

1. Allow the user to upload an image.
2. Display the image as a tracing reference.
3. Let the user specify at least one known dimension.
4. Establish a consistent image-to-model scale.
5. Allow manual tracing or AI-assisted suggestions.
6. Validate the resulting geometry.
7. Require user review before treating the trace as authoritative.

Do not infer accurate physical dimensions from an image without a known scale or other defensible reference.

## FR-11: Save, reload, and export

The MVP must support saving and restoring the architectural model.

Prefer local persistence or a versioned JSON export if this avoids unnecessary backend infrastructure.

The serialized design should include:

- Schema version.
- Project metadata.
- Units.
- Building and level entities.
- Rooms and walls.
- Doors and windows.
- Furniture instances.
- Relevant design settings.
- Optional operation history.
- Source references where appropriate.

Do not serialize API keys, runtime secrets, or transient renderer objects.

Acceptance criteria:

- A saved design can be reloaded.
- Schema validation rejects malformed input safely.
- Unsupported schema versions are handled explicitly.
- The export contains enough information to restore supported geometry.
- User data is not transmitted to external services unless required and disclosed.

# 7. TECHNICAL ARCHITECTURE

## 7.1 Preferred architecture

Keep the application modular rather than distributing the MVP across unnecessary services.

```text
Clavis Web Application
|
+-- Workspace UI
|   +-- 2D Editor
|   +-- 3D Renderer
|   +-- Properties Inspector
|   +-- Validation Panel
|   +-- Furniture Catalog
|   +-- AI Assistant
|
+-- Shared Domain Layer
|   +-- Canonical Building Model
|   +-- Entity IDs
|   +-- Units and Geometry
|   +-- Operation Pipeline
|   +-- Constraint Engine
|   +-- Undo / Redo
|   +-- Serialization
|
+-- Agent Layer
|   +-- Intent Interpretation
|   +-- Structured Tool Calls
|   +-- Permission Checks
|   +-- Operation Execution
|   +-- Validation and Repair Loop
|
+-- Server-Side AI Adapter
|   +-- Meta Model API
|   +-- Structured Request / Response
|   +-- Timeout and Error Handling
|   +-- Optional Provider Adapters
|
+-- Optional Compute Services
    +-- Modal: Compute-Intensive Jobs
    +-- Baseten: Separately Served Model
    +-- Fireworks: Optional Open-Weight Model Inference
```

The domain model and geometry engine must remain independent of the AI provider.

## 7.2 Technology constraints

Prefer proven, stable technologies.

Potential technologies include:

- TypeScript.
- React.
- Next.js or Vite.
- Three.js.
- Existing compatible state-management libraries.
- Existing geometric primitives and validation code.
- Meta Model API.
- Existing test frameworks and browser automation.

Do not introduce a second frontend framework.

Do not add a database, authentication system, queue, vector database, or additional model framework unless the product establishes a real need.

## 7.3 Canonical data model

Define a typed model representing:

- `Building`
- `Level`
- `Room`
- `Wall`
- `Opening`
- `FurnitureInstance`
- `CatalogItem`
- `ValidationIssue`
- `DesignOperation`
- `DesignRevision`

The following is an illustrative contract. Adapt it to the chosen repository rather than creating incompatible duplicate types.

```ts
type Vec2 = {
  x: number;
  y: number;
};

type Wall = {
  id: string;
  levelId: string;
  start: Vec2;
  end: Vec2;
  thicknessM: number;
  heightM: number;
};

type Opening = {
  id: string;
  wallId: string;
  kind: "door" | "window";
  offsetM: number;
  widthM: number;
  heightM: number;
};

type FurnitureInstance = {
  id: string;
  catalogItemId: string;
  levelId: string;
  position: Vec2;
  rotationRad: number;
};

type ValidationIssue = {
  id: string;
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  entityIds: string[];
  measurements?: Record<string, number | string>;
};

type DesignOperationResult = {
  success: boolean;
  revision: number;
  changedEntityIds: string[];
  issues: ValidationIssue[];
  error?: {
    code: string;
    message: string;
  };
};
```

The complete model must additionally support the room representation, building metadata, levels, furniture dimensions, and any other entities already required by the chosen engine.

Use stable IDs. Avoid using array indices as persistent entity identities.

## 7.4 Geometry rules

- Store geometry in metres.
- Keep units consistent across imported and generated models.
- Define wall thickness and opening semantics explicitly.
- Define whether room boundaries are derived from walls or stored separately.
- Avoid maintaining contradictory copies of the same geometry.
- Centralize transformations and coordinate conversions.
- Define collision behavior for rotated furniture.
- Use robust geometric tolerances instead of scattered floating-point comparisons.
- Add regression tests for geometry operations.
- Keep display rounding separate from internal values.

# 8. META AI INTEGRATION

Meta AI is a core part of the hackathon story. It must power a useful user-facing capability.

Official documentation:

- https://dev.meta.ai/docs/overview
- https://dev.meta.ai/docs/models
- https://github.com/meta-models/meta-model-cookbook

The Meta Model API documentation currently describes Muse Spark, Muse Wonder, Muse Image, and other model lines. Verify the available models, modalities, request formats, and account permissions at implementation time.

## 8.1 Primary use case

Use a Meta model to interpret natural-language design requests and coordinate structured architectural operations.

Input:

- User's instruction.
- Relevant model summary.
- Room dimensions.
- Available entities.
- Relevant validation issues.
- Supported tool definitions.
- Current model revision.

Output:

- Interpreted user intent.
- Proposed structured operations.
- Required clarifying questions.
- Design rationale.
- Expected validation checks.

The application executes operations and determines their actual result.

## 8.2 Provider implementation

Implement a server-side Meta API adapter.

Use the current official endpoint and authentication method documented for the selected model. Do not hardcode unverified model IDs, parameters, or API capabilities.

Requirements:

- Keep credentials server-side.
- Validate incoming requests.
- Use a defined structured-output schema.
- Validate all model-generated operations.
- Handle timeouts, rate limits, malformed output, and provider failures.
- Prevent prompt injection from being interpreted as permission to bypass tool restrictions.
- Log operational metadata without unnecessarily logging sensitive user content.
- Make it clear when the model is unavailable.

## 8.3 Optional visual generation

Muse Image may be used for mood boards or concept imagery if time and API access permit.

Generated concept images must not be treated as dimensionally accurate architectural models. The geometry engine remains the source of truth.

Do not make image generation a P0 dependency.

# 9. SPONSOR INFRASTRUCTURE

The application must not integrate multiple inference providers redundantly. Each provider needs a distinct purpose, and actual availability must be verified before implementation.

## 9.1 Fireworks AI

Official documentation:

https://docs.fireworks.ai/

Potential role:

- Optional open-weight language-model inference.
- A baseline for comparing design interpretations.
- A fallback provider if an appropriate model is available and tested.
- Structured tool calling where supported by the chosen model.

Do not allow Fireworks and Meta to compete for control over the same design operation. Define one primary orchestration path.

## 9.2 Modal

Official documentation:

https://modal.com/docs

Potential role:

- Asynchronous geometry-heavy processing.
- Image preprocessing for floor-plan tracing.
- Batch generation of derived assets.
- Isolated compute workloads if required.
- Serving an appropriate open-weight model only if there is a demonstrated reason.

Do not move ordinary geometry calculations to a remote service merely to use Modal.

## 9.3 Baseten

Official documentation:

https://docs.baseten.co/

Potential role:

- Hosting a separately served open-weight model for an identified workload.
- Model inference for a tested visual or language task.
- A benchmark against the primary Meta integration if the available model supports the same task.

Do not assume a Baseten deployment automatically provides a vision model or architectural understanding. Select a concrete model, verify its interface, and test it.

## 9.4 Provider integration rule

The required implementation order is:

1. Complete the Meta Model API integration.
2. Establish an end-to-end baseline.
3. Identify an actual bottleneck or useful secondary workload.
4. Select the relevant sponsor service.
5. Integrate it behind a typed adapter.
6. Benchmark it.
7. Retain it only if it improves functionality, latency, reliability, or a meaningful evaluation.

The existence of sponsor credits does not justify unnecessary architectural complexity.

# 10. SECURITY AND RELIABILITY

Required safeguards:

- API keys are never exposed in client bundles.
- Environment variables are documented in `.env.example` without actual secrets.
- User input and imported JSON are validated.
- AI tool arguments are schema-checked.
- Mutating operations are restricted to explicit supported tools.
- Destructive operations require confirmation.
- The application never executes arbitrary LLM-generated code in the main process.
- File uploads are size-limited and validated.
- Uploaded files are processed safely.
- Imported models cannot introduce arbitrary executable content.
- Error messages do not expose credentials or internal stack traces to end users.
- Third-party API usage is bounded by timeouts and appropriate request limits.
- Dependency and asset licenses are documented.
- Any sandbox used for optional generated-code or model workloads is isolated and least-privileged.

# 11. USER EXPERIENCE AND DESIGN DIRECTION

Create a professional architectural workspace rather than a generic chatbot with a floor-plan image.

Design principles:

- Dark, high-contrast workspace.
- Precise typography and spatial hierarchy.
- Strong visual distinction between 2D drafting and 3D inspection.
- Clear measurement labels.
- Consistent selection and hover states.
- Restrained accent colors for selection, validation, and warnings.
- Useful loading and empty states.
- Responsive side panels.
- Minimal unnecessary animation.
- Accessible keyboard controls and visible focus states.

The interface should feel like a capable design tool, not a marketing landing page.

Required screens or states:

1. Project workspace.
2. Empty project state.
3. Active 2D editing state.
4. 3D preview state.
5. AI operation in progress.
6. Validation results.
7. Furniture catalog.
8. Operation confirmation.
9. Save and reload feedback.
10. AI provider failure state.
11. Invalid model state.
12. Completed investigation or design summary.

Do not spend the deadline creating a complex landing page before the core editor works.

# 12. TESTING STRATEGY

## 12.1 Unit tests

Test:

- Unit conversion.
- Entity ID uniqueness.
- Wall geometry.
- Opening constraints.
- Room area calculations.
- Furniture transforms.
- Collision detection.
- Serialization and deserialization.
- Operation validation.
- Undo and redo.
- Validation result consistency.

## 12.2 Integration tests

Test:

- Natural-language request to structured operation.
- Structured operation to model mutation.
- Model mutation to synchronized 2D/3D rendering.
- Model mutation to validation results.
- Furniture placement to collision detection.
- AI repair proposal to revalidation.
- Provider errors to graceful user-facing recovery.
- Save and reload to restored geometry.

## 12.3 Browser end-to-end tests

Automate the critical workflow:

1. Open the application.
2. Create a project.
3. Add or generate a floor plan.
4. Select a wall.
5. Modify its geometry.
6. Verify the 3D view changes.
7. Introduce an invalid operation.
8. Verify the validation issue appears.
9. Place a furniture item.
10. Verify the item's dimensions and collision status.
11. Save and reload.
12. Verify the model persists.

Use the existing test framework if it is reliable.

## 12.4 Acceptance thresholds

The MVP is not considered complete until:

- Production build succeeds.
- Existing applicable tests pass.
- Critical domain and geometry tests pass.
- No uncaught exceptions occur in the core demonstration workflow.
- The canonical model remains consistent across supported operations.
- Invalid operations do not silently corrupt the model.
- The Meta API integration has been tested with a real successful request.
- Provider failures are handled gracefully.
- A fresh deployment or local environment can reproduce the demonstration.
- The documented limitations match the actual implementation.

Do not invent numerical model-quality thresholds. Establish a baseline, record observed results, and disclose the evaluation method.

# 13. DELIVERY SCHEDULE

The hackathon period is short. The schedule is a prioritization plan, not a promise that every optional feature will be completed.

## October 27 — Foundation

- Set up the codebase, dependencies and baseline tests.
- Confirm model API access.
- Freeze the initial architecture.

Deliverable: reproducible baseline and documented plan.

## October 28 — Canonical model and editor

- Establish the single model.
- Verify entity identifiers.
- Verify basic editing operations.
- Verify 2D/3D synchronization.
- Add or repair core geometry tests.

Deliverable: reliable basic architectural editing.

## October 29 — Constraint engine

- Implement or integrate the essential validation checks.
- Connect issues to affected entities.
- Add regression tests.
- Verify invalid operations are handled safely.

Deliverable: demonstrable geometry validation.

## October 30 — AI interaction

- Implement the Meta API adapter.
- Define structured intent and operation schemas.
- Connect the assistant to the canonical model.
- Implement the permitted tool-execution loop.
- Add confirmation for destructive operations.

Deliverable: one real natural-language-to-model workflow.

## October 31 — AI repair and furniture

- Implement correction proposals.
- Revalidate every applied correction.
- Add a usable furniture catalog.
- Implement placement and collision checking.
- Add save and reload if not already reliable.

Deliverable: a complete design and validation workflow.

## November 1 — Integration and evaluation

- Run end-to-end tests.
- Fix the highest-impact defects.
- Verify error handling.
- Measure the core workflow.
- Add sponsor infrastructure only if a concrete need has been established.

Deliverable: stable end-to-end candidate.

## November 2 — Product polish

- Refine the editor layout.
- Improve measurement display and validation feedback.
- Improve furniture placement and 3D presentation.
- Add a design summary or export if feasible.

Deliverable: coherent, demonstrable product.

## November 3 — Feature freeze

- Freeze nonessential features.
- Fix regressions.
- Test deployment.
- Verify all environment variables.
- Record a backup demo.
- Complete README, architecture documentation, and third-party notices.

Deliverable: release candidate.

## November 4 — Final verification and submission

- Test the final deployment.
- Verify the submission links and instructions.
- Record or refresh the final demo.
- Confirm that the final description matches implemented functionality.
- Submit before 9 PM ET.
- Preserve proof of submission.

The corresponding India deadline is November 5 at 7:30 AM IST. Do not wait until the final minute.

# 14. REQUIRED DELIVERABLES

The repository should include:

- `README.md` — setup, architecture, usage, limitations, and demo.
- `docs/ARCHITECTURE.md` — application and data flow.
- `docs/PRD.md` — this specification, adapted to the final implementation.
- `docs/TESTING.md` — test instructions and observed results.
- `docs/AI_INTEGRATION.md` — model choices, structured contracts, and failure handling.
- `.env.example` — required variable names without credentials.
- Automated tests.
- A documented deployment configuration.
- A short demo video.
- A working demo URL.
- A final submission description.

Do not create empty documents that claim work has been completed. Populate them with verified information.

# 15. FINAL DEMO SCRIPT

Target a concise demonstration of approximately two minutes.

### Scene 1: Introduce the problem

Show the architectural workspace and explain that conventional design tools require users to manipulate geometry manually, while generic AI image generation cannot guarantee valid dimensions.

### Scene 2: Generate a design

Enter a natural-language instruction for a small residential layout.

Show the structured operation and the resulting editable floor plan.

### Scene 3: Inspect the geometry

Switch to 3D. Modify a wall or opening and demonstrate that the 2D and 3D representations remain synchronized.

### Scene 4: Detect and repair a problem

Introduce a deliberate spatial conflict. Show the deterministic validation result, request a correction, apply it, and run validation again.

### Scene 5: Furnish the space

Place an actual catalog item, inspect its dimensions, and demonstrate the collision or clearance check.

### Scene 6: Explain the result

Show the Meta-powered explanation grounded in actual measurements and validation results.

### Scene 7: Close with evidence

Show the final design, validation summary, and a concise explanation of what is implemented versus what remains experimental.

Never fabricate a live model response or present a prerecorded sequence as a live interaction without disclosure.

# 16. SUCCESS METRICS

Collect evidence for:

- Percentage of core workflow tests passing.
- Successful structured operation rate on a fixed set of test instructions.
- Number of invalid operations rejected safely.
- Agreement between the canonical model and rendered geometry.
- Furniture collision-check behavior on known test cases.
- Observed response latency for the AI workflow.
- Number of supported design operations.
- Successful save/reload behavior.
- Known failure cases and current limitations.

A small, reproducible evaluation is preferable to unsupported claims of architectural accuracy or AI superiority.

# 17. FINAL DEFINITION OF DONE

Clavis is ready for submission when:

1. The selected codebase and reuse decisions are documented.
2. The application builds and runs reproducibly.
3. A user can edit a valid architectural model.
4. The 2D and 3D views represent the same underlying model.
5. The AI can execute supported design operations through structured tools.
6. The geometry engine validates operations deterministically.
7. The application can identify and correct at least one meaningful spatial problem.
8. Furniture placement uses actual dimensions and supports collision checks.
9. A real Meta model call contributes to the core user experience.
10. The application handles failures without false success messages.
11. Tests demonstrate the principal workflow.
12. The final demo can be reproduced.
13. Relevant limitations are documented.
14. The submission accurately describes the product that was built.

# 18. FINAL INSTRUCTION

Then implement incrementally, running the relevant tests after each meaningful change.

The highest priority is a reliable, differentiated architectural workflow powered by Meta AI. Optional features and additional infrastructure must never destabilize that core experience.

**Build Clavis as one coherent product, prove the geometry works, demonstrate meaningful AI collaboration, and report only what has actually been verified.**