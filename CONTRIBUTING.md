# Contributing to mcp-state-sync

Thank you for your interest in contributing to mcp-state-sync! This document provides guidelines and information about contributing.

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## How to Contribute

### Reporting Bugs

Before submitting a bug report:

1. Check the [existing issues](https://github.com/vinkius-labs/mcp-state-sync/issues) to avoid duplicates
2. Collect information about the bug:
   - Stack trace
   - Node.js version (`node --version`)
   - TypeScript version
   - Package version
   - Steps to reproduce

Then [open a new issue](https://github.com/vinkius-labs/mcp-state-sync/issues/new?template=bug_report.md) with the bug report template.

### Suggesting Features

Feature requests are welcome! Please:

1. Check existing issues and discussions first
2. Describe the use case clearly
3. Explain why existing features don't solve your problem
4. [Open a feature request](https://github.com/vinkius-labs/mcp-state-sync/issues/new?template=feature_request.md)

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Install dependencies**: `npm install`
3. **Make your changes**
4. **Add tests** for any new functionality
5. **Run tests**: `npm test`
6. **Run build**: `npm run build`
7. **Ensure test coverage** for new code
8. **Submit a pull request**

#### Pull Request Guidelines

- Follow the existing code style
- Write clear commit messages
- Update documentation if needed
- Add tests for new features
- Keep PRs focused — one feature or fix per PR
- Zero `any` types — use `unknown` where generics are needed

### Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/mcp-state-sync.git
cd mcp-state-sync

# Install dependencies
npm install

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Build
npm run build
```

### Code Style

- Use TypeScript strict mode
- Follow existing patterns in the codebase
- Write JSDoc comments for public APIs
- Keep functions small and focused
- Use meaningful variable names
- Zero `any` — use `unknown` where needed
- Prefer pure functions; use classes only where state is required

### Testing

- Write tests for all new functionality
- Maintain or improve code coverage
- Include edge cases and error scenarios
- Test both Fusion Mode and Manual Mode paths where applicable

### Documentation

- Update README.md for user-facing changes
- Update relevant docs in `/docs` folder
- Add JSDoc comments to public APIs
- Include code examples where helpful

## Project Structure

```
src/
├── StateSync.ts             # Facade (entry point)
├── PolicyEngine.ts          # First-match-wins resolution + cache
├── ServerWrapper.ts         # MCP Server interception
├── DescriptionDecorator.ts  # Cache-Control directive decoration
├── CausalEngine.ts          # isError guard + invalidation resolution
├── ResponseDecorator.ts     # System block prepending
├── GlobMatcher.ts           # Dot-separated glob matching
├── PolicyValidator.ts       # Fail-fast eager validation
├── ServerResolver.ts        # Duck-type Server vs McpServer
├── UpstreamFactory.ts       # Fusion / Manual upstream adapters
├── types.ts                 # All type definitions
└── index.ts                 # Barrel exports
tests/
├── *.test.ts                # Unit + integration tests
docs/
├── architecture.md
├── api-reference.md
├── configuration.md
└── design-rationale.md
examples/
├── *.md                     # Detailed threat explanations
└── *.ts                     # Complete TypeScript examples
```

## Questions?

Feel free to [open a discussion](https://github.com/vinkius-labs/mcp-state-sync/discussions) for questions or ideas.

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
