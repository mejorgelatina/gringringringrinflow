export class FlowError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = "FlowError"
    this.code = code
  }
}
