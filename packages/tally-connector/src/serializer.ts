export class RequestSerializer {
  private queue: Promise<unknown> = Promise.resolve();

  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.queue.then(fn, fn);
    this.queue = result.catch(() => undefined);
    return result;
  }
}
