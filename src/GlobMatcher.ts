/**
 * GlobMatcher — Dot-Separated Glob Pattern Matching
 *
 * Pure function. Single responsibility: match a dot-separated tool name
 * against a glob pattern.
 *
 * - `*`  matches exactly one segment
 * - `**` matches zero or more segments
 */

/**
 * Match a dot-separated name against a glob pattern.
 *
 * @example
 * matchGlob('sprints.*', 'sprints.get')       // true
 * matchGlob('sprints.*', 'sprints.tasks.get') // false
 * matchGlob('**', 'anything.at.all')          // true
 */
export function matchGlob(pattern: string, name: string): boolean {
    return matchSegments(
        pattern.split('.'), 0,
        name.split('.'), 0,
    );
}

function matchSegments(
    pp: string[], pi: number,
    np: string[], ni: number,
): boolean {
    if (pi === pp.length && ni === np.length) return true;
    if (pi === pp.length) return false;
    if (ni === np.length) {
        for (let i = pi; i < pp.length; i++) {
            if (pp[i] !== '**') return false;
        }
        return true;
    }

    const segment = pp[pi];

    if (segment === '**') {
        return matchSegments(pp, pi + 1, np, ni)
            || matchSegments(pp, pi, np, ni + 1);
    }

    if (segment === '*' || segment === np[ni]) {
        return matchSegments(pp, pi + 1, np, ni + 1);
    }

    return false;
}
