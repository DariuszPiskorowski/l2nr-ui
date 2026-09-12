export const UI_NODE_SPEC_VERSION = 1 as const;

export interface UiDisplaySpec {
  valueProperty?: string;
  caption?: string;
  label?: string;
  min?: number;
  max?: number;
}

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
  display?: UiDisplaySpec;
  output: {
    target: "msg.payload";
  } | null;
}

export function assertUiNodeSpec(value: unknown): asserts value is UiNodeSpec {
  if (!value || typeof value !== "object") {
    throw new TypeError("UI node manifest must be an object");
  }

  const candidate = value as Partial<UiNodeSpec>;
  if (candidate.schemaVersion !== UI_NODE_SPEC_VERSION) {
    throw new TypeError("Unsupported schemaVersion: " + String(candidate.schemaVersion));
  }

  for (const key of ["name", "label", "component"] as const) {
    if (typeof candidate[key] !== "string" || candidate[key].trim() === "") {
      throw new TypeError(key + " must be a non-empty string");
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

  if (candidate.display !== undefined) {
    if (!candidate.display || typeof candidate.display !== "object") {
      throw new TypeError("display must be an object");
    }

    for (const key of ["valueProperty", "caption", "label"] as const) {
      const field = candidate.display[key];
      if (field !== undefined && typeof field !== "string") {
        throw new TypeError("display." + key + " must be a string");
      }
    }

    if (candidate.display.valueProperty !== undefined && candidate.display.valueProperty.trim() === "") {
      throw new TypeError("display.valueProperty must not be empty");
    }

    for (const key of ["min", "max"] as const) {
      const field = candidate.display[key];
      if (field !== undefined && (typeof field !== "number" || !Number.isFinite(field))) {
        throw new TypeError("display." + key + " must be a finite number");
      }
    }

    if (
      candidate.display.min !== undefined &&
      candidate.display.max !== undefined &&
      candidate.display.min >= candidate.display.max
    ) {
      throw new TypeError("display.min must be less than display.max");
    }
  }

  if (candidate.output !== null && candidate.output?.target !== "msg.payload") {
    throw new TypeError('output must be null or target "msg.payload"');
  }
}
