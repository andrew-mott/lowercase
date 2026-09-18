import { EventEmitter } from "events";
import type { EventBusPort, PublishOptions } from "@lcase/ports";
import type { AnyEvent } from "@lcase/types";

export class InMemoryEventBus implements EventBusPort {
  #ee = new EventEmitter().setMaxListeners(0);
  #patterns = new Map<string, string[]>();
  observabilityTopic = "observability";
  wildcard = "*";

  constructor() {}

  /**
   * publish an event to a specific channel.
   *
   * also publishes to prefixes and suffixes of wildcard channels
   *
   * @param topic bus channel "string" to publish to
   * @param event EventEnvelope to send on that channel
   * @returns Promise<void>
   * @description Uses the queueMicrotask to postpone emission slightly to
   * prevent recursive loops or having other emitions preempt the execution and
   * handling of this emition.
   *
   * Uses Node's EventEmitter under the hood.
   */
  async publish(
    topic: string,
    event: AnyEvent,
    options?: PublishOptions,
  ): Promise<void> {
    const topics = this.getTopics(topic, options);

    const payload = Object.freeze(event);

    queueMicrotask(() => {
      try {
        for (const topic of topics) this.#ee.emit(topic, payload);
      } catch (err) {
        console.error(`[bus.publish]: emit error '${topic}', event:${payload}`);
        console.error(err);
      }
    });
  }

  subscribe(
    topic: string,
    handler: (e: AnyEvent, t?: string) => Promise<void>,
  ): () => unknown {
    const safeHandler = (e: AnyEvent, t: string) => {
      try {
        handler(e, t ?? topic);
      } catch (err) {
        console.error(`[safeHandler] error event ${e}, topic ${t}`, err);
      }
    };
    this.#ee.on(topic, safeHandler);
    return () => {
      this.#ee.off(topic, safeHandler);
    };
  }
  async close(): Promise<unknown> {
    return this.#ee.removeAllListeners();
  }
  getTopics(topic: string, options?: PublishOptions): string[] {
    const topics: string[] = [];
    // add in observability topic if set
    if (this.observabilityTopic && !options?.internal) {
      topics.push(this.observabilityTopic);
    }
    // early return if this is wildcard.
    if (topic === this.wildcard) {
      topics.push(this.wildcard);
      return topics;
    }

    topics.push(this.wildcard); // otherwise add wildcard
    topics.push(topic); // add the raw topic... next get patterns

    if (this.#patterns.has(topic)) {
      const patterns = this.#patterns.get(topic);
      if (!patterns) return topics;
      return topics.concat(patterns);
    }
    const patterns = this.generatePatterns(topic);
    this.#patterns.set(topic, patterns);
    return topics.concat(patterns);
  }

  generatePatterns(topic: string): string[] {
    if (topic === this.wildcard) return [];
    const parts = topic.split(".");
    const patterns: string[] = [];
    for (let i = 1; i < parts.length; i++) {
      const prefixPattern = parts.slice(0, i);
      const suffixPattern = parts.slice(parts.length - i);

      patterns.push(prefixPattern.join(".") + "." + this.wildcard);
      patterns.push(this.wildcard + "." + suffixPattern.join("."));
    }

    if (parts.length === 3) {
      patterns.push(parts[0] + "." + this.wildcard + "." + parts[2]);
    }
    return patterns;
  }
}
