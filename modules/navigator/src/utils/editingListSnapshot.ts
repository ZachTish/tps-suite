/** Keep the visible ordering stable across the saves/projections of one typing burst. */
export class EditingListSnapshot<T> {
    private value: T | undefined;
    private context: unknown;
    private quietAt = 0;

    edit(now: number): void {
        this.quietAt = now + 2000;
    }

    release(): void {
        this.quietAt = 0;
    }

    select(next: T, context: unknown, now: number): T {
        if (this.value === undefined || context !== this.context || now >= this.quietAt) {
            this.value = next;
            this.context = context;
        }
        return this.value;
    }
}
