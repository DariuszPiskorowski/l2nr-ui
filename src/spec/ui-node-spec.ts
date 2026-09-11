export const UI_NODE_SPEC_VERSION = 1 as const;

export interface UiNodeSpec {
  schemaVersion: typeof UI_NODE_SPEC_VERSION;
  name: string;
  label: string;
  component: string;
  dashboard: {
    width: number;
    height: number;
  };
  input: {
    source: "msg.payload";
  };
  output: {
    target: "msg.payload";
  };
}

export function assertUiNodeSpec(value: unknown): asserts value is UiNodeSpec {
  if (!value || typeof value !== "object") {
    throw new TypeError("UI node manifest must be an object");
  }

  const candidate = value as Partial<UiNodeSpec>;
  if (candidate.schemaVersion !== UI_NODE_SPEC_VERSION) {
    throw new TypeError(`Unsupported schemaVersion: ${String(candidate.schemaVersion)}`);
  }

  for (const key of ["name", "label", "component"] as const) {
    if (typeof candidate[key] !== "string" || candidate[key].trim() === "") {
      throw new TypeError(`${key} must be a non-empty string`);
    }
  }

  if (
    !candidate.dashboard ||
    !Number.isInteger(candidate.dashboard.width) ||
    !Number.isInteger(candidate.dashboard.height) ||
    candidate.dashboard.width < 1 ||
    candidate.dashboard.height < 1
  ) {
    throw new TypeError("dashboard width and height must be positive integers");
  }

  if (candidate.input?.source !== "msg.payload") {
    throw new TypeError('input.source must be "msg.payload"');
  }

  if (candidate.output?.target !== "msg.payload") {
    throw new TypeError('output.target must be "msg.payload"');
  }
}
