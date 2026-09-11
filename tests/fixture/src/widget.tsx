export function Widget(): string {
  return window.localStorage.getItem("value") ?? "empty";
}
