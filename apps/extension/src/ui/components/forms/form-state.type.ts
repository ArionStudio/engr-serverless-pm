export type OperationState = "idle" | "pending" | "success" | "error";
export type FormPresentation<T> = {
  value: T;
  onChange: (value: T) => void;
  onSubmit: () => void;
  onCancel: () => void;
  state?: OperationState;
  errors?: Partial<Record<keyof T, string>>;
  message?: string;
};
