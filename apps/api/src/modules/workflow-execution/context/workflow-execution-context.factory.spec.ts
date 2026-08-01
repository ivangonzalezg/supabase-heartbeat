import { jest } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseClientFactory } from './supabase-client.factory';
import { WorkflowExecutionContextFactory } from './workflow-execution-context.factory';

describe('WorkflowExecutionContextFactory', () => {
  let stubClientFactory: { create: jest.Mock };
  let contextFactory: WorkflowExecutionContextFactory;

  beforeEach(() => {
    stubClientFactory = {
      create: jest.fn(
        () => ({ stubbed: 'client' }) as unknown as SupabaseClient,
      ),
    };
    contextFactory = new WorkflowExecutionContextFactory(
      stubClientFactory as unknown as SupabaseClientFactory,
    );
  });

  const buildInput = () => ({
    projectId: 'project-1',
    workflowId: 'workflow-1',
    supabaseUrl: 'https://example.supabase.co',
    publishableKey: 'sb_publishable_example',
  });

  it('creates one context carrying the given project and workflow identity', () => {
    const context = contextFactory.create(buildInput());

    expect(context.project.id).toBe('project-1');
    expect(context.project.supabaseUrl).toBe('https://example.supabase.co');
    expect(context.workflow.id).toBe('workflow-1');
  });

  it('delegates client creation to the Supabase client factory', () => {
    contextFactory.create(buildInput());

    expect(stubClientFactory.create).toHaveBeenCalledTimes(1);
    expect(stubClientFactory.create).toHaveBeenCalledWith({
      supabaseUrl: 'https://example.supabase.co',
      publishableKey: 'sb_publishable_example',
    });
  });

  it('uses the client returned by the client factory as context.supabase', () => {
    const context = contextFactory.create(buildInput());

    expect(context.supabase).toEqual({ stubbed: 'client' });
  });

  it('creates independent clients (and contexts) for separate calls', () => {
    const first = contextFactory.create(buildInput());
    const second = contextFactory.create({
      ...buildInput(),
      projectId: 'project-2',
      workflowId: 'workflow-2',
    });

    expect(stubClientFactory.create).toHaveBeenCalledTimes(2);
    expect(first).not.toBe(second);
    expect(first.supabase).not.toBe(second.supabase);
  });

  it('does not retain the signin password: the input has no password field at all', () => {
    const input = buildInput();
    const context = contextFactory.create(input);

    expect(context).not.toHaveProperty('password');
    expect(JSON.stringify(input)).not.toContain('password');
  });

  it('does not mutate its input', () => {
    const input = buildInput();
    const snapshot = { ...input };

    contextFactory.create(input);

    expect(input).toEqual(snapshot);
  });
});
