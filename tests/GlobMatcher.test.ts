import { describe, it, expect } from 'vitest';
import { matchGlob } from '../src/GlobMatcher.js';

describe('matchGlob', () => {
    it('matches exact names', () => {
        expect(matchGlob('sprints.get', 'sprints.get')).toBe(true);
        expect(matchGlob('sprints.get', 'sprints.update')).toBe(false);
    });

    it('matches single wildcard (*) against one segment', () => {
        expect(matchGlob('sprints.*', 'sprints.get')).toBe(true);
        expect(matchGlob('sprints.*', 'sprints.update')).toBe(true);
        expect(matchGlob('*.get', 'sprints.get')).toBe(true);
        expect(matchGlob('*.get', 'tasks.get')).toBe(true);
    });

    it('does not match single wildcard across multiple segments', () => {
        expect(matchGlob('sprints.*', 'sprints.tasks.get')).toBe(false);
    });

    it('matches double wildcard (**) across zero or more segments', () => {
        expect(matchGlob('**', 'sprints.get')).toBe(true);
        expect(matchGlob('**', 'a.b.c.d')).toBe(true);
        expect(matchGlob('**', 'single')).toBe(true);
        expect(matchGlob('sprints.**', 'sprints.get')).toBe(true);
        expect(matchGlob('sprints.**', 'sprints.tasks.get')).toBe(true);
    });

    it('matches ** at zero segments', () => {
        expect(matchGlob('sprints.**', 'sprints')).toBe(true);
    });

    it('handles mixed wildcards', () => {
        expect(matchGlob('**.get', 'sprints.get')).toBe(true);
        expect(matchGlob('**.get', 'a.b.c.get')).toBe(true);
        expect(matchGlob('**.get', 'a.b.c.update')).toBe(false);
    });

    it('does not match when pattern is longer than name', () => {
        expect(matchGlob('a.b.c', 'a.b')).toBe(false);
    });
});
