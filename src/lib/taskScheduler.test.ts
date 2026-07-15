import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { TaskScheduler } from './taskScheduler';

describe('TaskScheduler', () => {
  let scheduler: TaskScheduler;

  beforeEach(() => {
    vi.useFakeTimers();
    scheduler = new TaskScheduler();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('executes a task after the delay', () => {
    const fn = vi.fn();
    scheduler.schedule('test', 100, fn);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('passes an AbortSignal to the task', () => {
    const fn = vi.fn();
    scheduler.schedule('test', 100, fn);
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it('cancels a pending task on reschedule', () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    scheduler.schedule('test', 100, fn1);
    scheduler.schedule('test', 100, fn2);
    vi.advanceTimersByTime(100);
    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).toHaveBeenCalledTimes(1);
  });

  it('cancels a task via cancel()', () => {
    const fn = vi.fn();
    scheduler.schedule('test', 100, fn);
    scheduler.cancel('test');
    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();
  });

  it('cancelled task does not execute', () => {
    const fn = vi.fn();
    scheduler.schedule('test', 100, fn);
    scheduler.cancel('test');
    vi.advanceTimersByTime(100);
    expect(fn).not.toHaveBeenCalled();
  });

  it('cancels all tasks via cancelAll()', () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    scheduler.schedule('a', 100, fn1);
    scheduler.schedule('b', 200, fn2);
    scheduler.cancelAll();
    vi.advanceTimersByTime(300);
    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).not.toHaveBeenCalled();
  });

  it('hasPending returns correct state', () => {
    expect(scheduler.hasPending('test')).toBe(false);
    scheduler.schedule('test', 100, vi.fn());
    expect(scheduler.hasPending('test')).toBe(true);
    vi.advanceTimersByTime(100);
    expect(scheduler.hasPending('test')).toBe(false);
  });

  it('handles multiple independent keys', () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    scheduler.schedule('a', 100, fn1);
    scheduler.schedule('b', 200, fn2);
    vi.advanceTimersByTime(100);
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn2).toHaveBeenCalledTimes(1);
  });

  it('debounce: resets timer on repeated schedule', () => {
    const fn = vi.fn();
    scheduler.schedule('test', 100, fn);
    vi.advanceTimersByTime(50);
    scheduler.schedule('test', 100, fn); // reset timer
    vi.advanceTimersByTime(60);  // only 60ms past reset
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(40);  // now 100ms past reset
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not throw when cancelling non-existent key', () => {
    expect(() => scheduler.cancel('nonexistent')).not.toThrow();
  });

  it('does not throw when cancelling after execution', () => {
    scheduler.schedule('test', 100, vi.fn());
    vi.advanceTimersByTime(100);
    expect(() => scheduler.cancel('test')).not.toThrow();
  });
});
