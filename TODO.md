# Plan for Useful Value & Production Quality

## Pre-planner Orientation

```markdown
<thinking>
    What is the highest level USER OBJECTIVE?
    
    The user wants a production-quality, best-in-class Raycast extension for Rio terminal with exactly 5 features:
    1. Launch Rio terminal with smart defaults
    2. Advanced launching with profiles  
    3. Configure Rio through Raycast UI
    4. Manage sessions
    5. Menu bar integration
    
    The user has been extremely clear: "DO NOT SIMPLIFY ANYTHING", "Minimal == Bad Solution", "Complexity is the source of all best-in-class implementations", "Be a software artisan". They want a production quality deliverable with no shortcuts, no placeholders, no stub implementations.
    
    The ESLint analysis revealed 2,775 code quality issues (2,592 errors, 183 warnings) that must all be fixed for production deployment.
</thinking>
```

## Milestone Analysis

```markdown
<thinking>
  - What milestones have we completed?
    ✅ Basic project structure with TypeScript, React, Raycast API integration
    ✅ Core service architecture (ProcessService, SessionService, ConfigService, RioConfigManager)
    ✅ Security vulnerabilities fixed (command injection, input validation)
    ✅ Session recording implemented with asciinema (not stubbed)
    ✅ Basic component structure created
    ✅ ESLint v9 configuration working with strictest rules
    ✅ Dependency updates to latest versions (@raycast/utils 2.0.1, etc.)

  - What's the last milestone we completed?
    ESLint configuration fix and comprehensive code quality analysis revealing 2,775 issues

  - What's the current milestone?
    Transform from current state (basic implementation with 2,775 code quality issues) to 10/10 production quality across all 5 requested features

  - What's the scope, the quintessence of "done"?
    - All 2,775 ESLint errors and warnings resolved with proper TypeScript types
    - All 5 features implemented with complex, rich functionality (no placeholders)
    - Type-safe, secure, performant, maintainable code
    - Comprehensive error handling and edge case coverage

  - What should we be able to prove, demonstrate at the end of the current milestone?
    - Clean `npm run lint` with zero issues  
    - All 5 features working flawlessly with advanced capabilities
    - Production-ready codebase that exemplifies software craftsmanship
</thinking>
```

## Decomposition of Task Items

## Phase 1: Critical Type Safety Foundation

- [ ] **Fix all @typescript-eslint/no-unsafe-assignment errors across codebase**
  DO NOT MOCK, FABRICATE, FAKE or SIMULATE ANY OPERATION or DATA. Make ONLY THE MINIMAL, SURGICAL CHANGES required. Do not modify or rewrite any portion of the app outside scope.

- [ ] **Act as an Objective QA Rust developer** - Rate the work performed previously on fixing @typescript-eslint/no-unsafe-assignment errors. Verify all `any` types have been properly typed with specific TypeScript interfaces. Confirm no unsafe assignments remain in the codebase.

- [ ] **Fix all @typescript-eslint/no-unsafe-member-access errors across codebase**
  DO NOT MOCK, FABRICATE, FAKE or SIMULATE ANY OPERATION or DATA. Make ONLY THE MINIMAL, SURGICAL CHANGES required. Do not modify or rewrite any portion of the app outside scope.

- [ ] **Act as an Objective QA Rust developer** - Rate the work performed previously on fixing @typescript-eslint/no-unsafe-member-access errors. Verify all property accesses are type-safe with proper TypeScript interfaces. Confirm no unsafe member access patterns remain.

- [ ] **Fix all @typescript-eslint/no-unsafe-call errors across codebase**
  DO NOT MOCK, FABRICATE, FAKE or SIMULATE ANY OPERATION or DATA. Make ONLY THE MINIMAL, SURGICAL CHANGES required. Do not modify or rewrite any portion of the app outside scope.

- [ ] **Act as an Objective QA Rust developer** - Rate the work performed previously on fixing @typescript-eslint/no-unsafe-call errors. Verify all function calls are type-safe with proper parameter and return type definitions. Confirm no unsafe function calls remain.

- [ ] **Fix all @typescript-eslint/strict-boolean-expressions errors across codebase**
  DO NOT MOCK, FABRICATE, FAKE or SIMULATE ANY OPERATION or DATA. Make ONLY THE MINIMAL, SURGICAL CHANGES required. Do not modify or rewrite any portion of the app outside scope.

- [ ] **Act as an Objective QA Rust developer** - Rate the work performed previously on fixing @typescript-eslint/strict-boolean-expressions errors. Verify all conditional expressions have explicit null/undefined checks. Confirm no nullable values are used in boolean contexts without proper checks.

- [ ] **Add explicit return types to all functions missing @typescript-eslint/explicit-function-return-type**
  DO NOT MOCK, FABRICATE, FAKE or SIMULATE ANY OPERATION or DATA. Make ONLY THE MINIMAL, SURGICAL CHANGES required. Do not modify or rewrite any portion of the app outside scope.

- [ ] **Act as an Objective QA Rust developer** - Rate the work performed previously on adding explicit return types. Verify all functions have proper return type annotations. Confirm TypeScript can infer all types correctly without ambiguity.

- [ ] **Remove all unused variables and imports (@typescript-eslint/no-unused-vars)**
  DO NOT MOCK, FABRICATE, FAKE or SIMULATE ANY OPERATION or DATA. Make ONLY THE MINIMAL, SURGICAL CHANGES required. Do not modify or rewrite any portion of the app outside scope.

- [ ] **Act as an Objective QA Rust developer** - Rate the work performed previously on removing unused variables and imports. Verify no unused code remains that could cause confusion or maintenance issues. Confirm all imports are necessary and used.

## Phase 2: Feature 1 - Launch Rio Terminal with Smart Defaults

- [ ] **Fix ConfigurationEditor.tsx type safety and complexity issues (21+ ESLint errors)**
  DO NOT MOCK, FABRICATE, FAKE or SIMULATE ANY OPERATION or DATA. Make ONLY THE MINIMAL, SURGICAL CHANGES required. Do not modify or rewrite any portion of the app outside scope.

- [ ] **Act as an Objective QA Rust developer** - Rate the work performed previously on fixing ConfigurationEditor.tsx. Verify all type safety issues are resolved, function complexity is under limits, and proper TypeScript types are used throughout. Confirm component renders without errors.

- [ ] **Implement intelligent working directory detection (git root, recent projects)**
  DO NOT MOCK, FABRICATE, FAKE or SIMULATE ANY OPERATION or DATA. Make ONLY THE MINIMAL, SURGICAL CHANGES required. Do not modify or rewrite any portion of the app outside scope.

- [ ] **Act as an Objective QA Rust developer** - Rate the work performed previously on intelligent directory detection. Verify git root detection works correctly, recent projects are tracked properly, and directory selection is intelligent. Confirm no false positives or missed directories.

- [ ] **Add project type detection (.git, package.json, Cargo.toml, etc.) for context-aware defaults**
  DO NOT MOCK, FABRICATE, FAKE or SIMULATE ANY OPERATION or DATA. Make ONLY THE MINIMAL, SURGICAL CHANGES required. Do not modify or rewrite any portion of the app outside scope.

- [ ] **Act as an Objective QA Rust developer** - Rate the work performed previously on project type detection. Verify all major project types are detected correctly (Node.js, Rust, Python, etc.). Confirm context-aware defaults are applied appropriately for each project type.

- [ ] **Integrate @raycast/utils useFrecencySorting for intelligent directory suggestions**
  DO NOT MOCK, FABRICATE, FAKE or SIMULATE ANY OPERATION or DATA. Make ONLY THE MINIMAL, SURGICAL CHANGES required. Do not modify or rewrite any portion of the app outside scope.

- [ ] **Act as an Objective QA Rust developer** - Rate the work performed previously on frecency sorting integration. Verify directories are sorted by frequency and recency of use. Confirm integration with @raycast/utils is correct and performant.

- [ ] **Add smart environment variable inheritance from project context**
  DO NOT MOCK, FABRICATE, FAKE or SIMULATE ANY OPERATION or DATA. Make ONLY THE MINIMAL, SURGICAL CHANGES required. Do not modify or rewrite any portion of the app outside scope.

- [ ] **Act as an Objective QA Rust developer** - Rate the work performed previously on environment variable inheritance. Verify project-specific environment variables are detected and inherited correctly. Confirm no sensitive data is leaked or improperly handled.

- [ ] **Add intelligent shell selection based on project type and user preferences**
  DO NOT MOCK, FABRICATE, FAKE or SIMULATE ANY OPERATION or DATA. Make ONLY THE MINIMAL, SURGICAL CHANGES required. Do not modify or rewrite any portion of the app outside scope.

- [ ] **Act as an Objective QA Rust developer** - Rate the work performed previously on intelligent shell selection. Verify appropriate shells are selected for different project types. Confirm user preferences are respected and fallback options work correctly.

## Phase 3: Feature 2 - Advanced Launching with Profiles

- [ ] **Replace ProfileManager.tsx placeholder with complete implementation and TypeScript interfaces**
  DO NOT MOCK, FABRICATE, FAKE or SIMULATE ANY OPERATION or DATA. Make ONLY THE MINIMAL, SURGICAL CHANGES required. Do not modify or rewrite any portion of the app outside scope.

- [ ] **Act as an Objective QA Rust developer** - Rate the work performed previously on ProfileManager.tsx implementation. Verify complete replacement of placeholder with fully functional component. Confirm proper TypeScript interfaces are defined for all profile operations.

- [ ] **Implement profile CRUD operations with comprehensive validation**
  DO NOT MOCK, FABRICATE, FAKE or SIMULATE ANY OPERATION or DATA. Make ONLY THE MINIMAL, SURGICAL CHANGES required. Do not modify or rewrite any portion of the app outside scope.

- [ ] **Act as an Objective QA Rust developer** - Rate the work performed previously on profile CRUD operations. Verify create, read, update, delete operations work correctly with proper validation. Confirm error handling for invalid profile data.

- [ ] **Add profile template system (development, debugging, production environments)**
  DO NOT MOCK, FABRICATE, FAKE or SIMULATE ANY OPERATION or DATA. Make ONLY THE MINIMAL, SURGICAL CHANGES required. Do not modify or rewrite any portion of the app outside scope.

- [ ] **Act as an Objective QA Rust developer** - Rate the work performed previously on profile template system. Verify predefined templates are available for common scenarios. Confirm templates can be customized and extended appropriately.

- [ ] **Add profile inheritance and composition system**
  DO NOT MOCK, FABRICATE, FAKE or SIMULATE ANY OPERATION or DATA. Make ONLY THE MINIMAL, SURGICAL CHANGES required. Do not modify or rewrite any portion of the app outside scope.

- [ ] **Act as an Objective QA Rust developer** - Rate the work performed previously on profile inheritance system. Verify profiles can inherit from parent profiles correctly. Confirm composition and override mechanisms work as expected.

- [ ] **Add profile import/export functionality with error handling**
  DO NOT MOCK, FABRICATE, FAKE or SIMULATE ANY OPERATION or DATA. Make ONLY THE MINIMAL, SURGICAL CHANGES required. Do not modify or rewrite any portion of the app outside scope.

- [ ] **Act as an Objective QA Rust developer** - Rate the work performed previously on profile import/export. Verify profiles can be exported and imported correctly. Confirm proper error handling for corrupted or invalid profile files.

## Phase 4: Feature 3 - Configure Rio through Raycast UI

- [ ] **Replace ConfigureRio.tsx placeholder with complete TOML editor implementation**
  DO NOT MOCK, FABRICATE, FAKE or SIMULATE ANY OPERATION or DATA. Make ONLY THE MINIMAL, SURGICAL CHANGES required. Do not modify or rewrite any portion of the app outside scope.

- [ ] **Act as an Objective QA Rust developer** - Rate the work performed previously on ConfigureRio.tsx implementation. Verify complete replacement of placeholder with fully functional TOML editor. Confirm proper syntax highlighting and editing capabilities.

- [ ] **Implement real-time TOML configuration validation with TypeScript types**
  DO NOT MOCK, FABRICATE, FAKE or SIMULATE ANY OPERATION or DATA. Make ONLY THE MINIMAL, SURGICAL CHANGES required. Do not modify or rewrite any portion of the app outside scope.

- [ ] **Act as an Objective QA Rust developer** - Rate the work performed previously on TOML validation. Verify real-time validation works correctly with proper error messages. Confirm TypeScript types match Rio's configuration schema.

- [ ] **Add live preview system for configuration changes**
  DO NOT MOCK, FABRICATE, FAKE or SIMULATE ANY OPERATION or DATA. Make ONLY THE MINIMAL, SURGICAL CHANGES required. Do not modify or rewrite any portion of the app outside scope.

- [ ] **Act as an Objective QA Rust developer** - Rate the work performed previously on live preview system. Verify configuration changes are previewed in real-time without affecting actual Rio settings. Confirm preview accuracy and performance.

- [ ] **Add configuration backup and restore functionality**
  DO NOT MOCK, FABRICATE, FAKE or SIMULATE ANY OPERATION or DATA. Make ONLY THE MINIMAL, SURGICAL CHANGES required. Do not modify or rewrite any portion of the app outside scope.

- [ ] **Act as an Objective QA Rust developer** - Rate the work performed previously on backup/restore functionality. Verify configurations can be backed up and restored correctly. Confirm no data loss or corruption during backup operations.

- [ ] **Add advanced settings search and categorization**
  DO NOT MOCK, FABRICATE, FAKE or SIMULATE ANY OPERATION or DATA. Make ONLY THE MINIMAL, SURGICAL CHANGES required. Do not modify or rewrite any portion of the app outside scope.

- [ ] **Act as an Objective QA Rust developer** - Rate the work performed previously on settings search and categorization. Verify search functionality works across all configuration options. Confirm logical categorization and easy navigation.

## Phase 5: Feature 4 - Manage Sessions

- [ ] **Build comprehensive session management UI with search and filtering**
  DO NOT MOCK, FABRICATE, FAKE or SIMULATE ANY OPERATION or DATA. Make ONLY THE MINIMAL, SURGICAL CHANGES required. Do not modify or rewrite any portion of the app outside scope.

- [ ] **Act as an Objective QA Rust developer** - Rate the work performed previously on session management UI. Verify complete interface for managing sessions with proper search and filtering capabilities. Confirm integration with existing SessionService.

- [ ] **Add session playback controls for asciinema recordings (pause, rewind, fast-forward)**
  DO NOT MOCK, FABRICATE, FAKE or SIMULATE ANY OPERATION or DATA. Make ONLY THE MINIMAL, SURGICAL CHANGES required. Do not modify or rewrite any portion of the app outside scope.

- [ ] **Act as an Objective QA Rust developer** - Rate the work performed previously on session playback controls. Verify all playback controls function correctly with asciinema recordings. Confirm smooth seeking and playback performance.

- [ ] **Add session content search by commands, output, duration, and metadata**
  DO NOT MOCK, FABRICATE, FAKE or SIMULATE ANY OPERATION or DATA. Make ONLY THE MINIMAL, SURGICAL CHANGES required. Do not modify or rewrite any portion of the app outside scope.

- [ ] **Act as an Objective QA Rust developer** - Rate the work performed previously on session content search. Verify search works across commands, output text, session duration, and metadata. Confirm search performance and accuracy.

- [ ] **Add session sharing and export capabilities with multiple formats**
  DO NOT MOCK, FABRICATE, FAKE or SIMULATE ANY OPERATION or DATA. Make ONLY THE MINIMAL, SURGICAL CHANGES required. Do not modify or rewrite any portion of the app outside scope.

- [ ] **Act as an Objective QA Rust developer** - Rate the work performed previously on session sharing and export. Verify sessions can be exported in multiple formats correctly. Confirm sharing functionality works without exposing sensitive information.

- [ ] **Add session annotations and bookmarking system**
  DO NOT MOCK, FABRICATE, FAKE or SIMULATE ANY OPERATION or DATA. Make ONLY THE MINIMAL, SURGICAL CHANGES required. Do not modify or rewrite any portion of the app outside scope.

- [ ] **Act as an Objective QA Rust developer** - Rate the work performed previously on session annotations and bookmarks. Verify users can annotate sessions and create bookmarks at specific points. Confirm annotations persist correctly.

## Phase 6: Feature 5 - Menu Bar Integration

- [ ] **Fix type safety issues in existing menu-bar.tsx component**
  DO NOT MOCK, FABRICATE, FAKE or SIMULATE ANY OPERATION or DATA. Make ONLY THE MINIMAL, SURGICAL CHANGES required. Do not modify or rewrite any portion of the app outside scope.

- [ ] **Act as an Objective QA Rust developer** - Rate the work performed previously on menu-bar.tsx type safety fixes. Verify all TypeScript errors are resolved and proper types are used throughout. Confirm component functions without runtime errors.

- [ ] **Add rich context menus with session thumbnails and previews**
  DO NOT MOCK, FABRICATE, FAKE or SIMULATE ANY OPERATION or DATA. Make ONLY THE MINIMAL, SURGICAL CHANGES required. Do not modify or rewrite any portion of the app outside scope.

- [ ] **Act as an Objective QA Rust developer** - Rate the work performed previously on rich context menus. Verify context menus display session thumbnails and previews correctly. Confirm performance and visual quality of thumbnails.

- [ ] **Add real-time status indicators (CPU/memory usage, active sessions)**
  DO NOT MOCK, FABRICATE, FAKE or SIMULATE ANY OPERATION or DATA. Make ONLY THE MINIMAL, SURGICAL CHANGES required. Do not modify or rewrite any portion of the app outside scope.

- [ ] **Act as an Objective QA Rust developer** - Rate the work performed previously on real-time status indicators. Verify CPU/memory usage is displayed accurately in real-time. Confirm active session counts are correct and updated promptly.

- [ ] **Add quick action functionality (new window in current dir, attach to session)**
  DO NOT MOCK, FABRICATE, FAKE or SIMULATE ANY OPERATION or DATA. Make ONLY THE MINIMAL, SURGICAL CHANGES required. Do not modify or rewrite any portion of the app outside scope.

- [ ] **Act as an Objective QA Rust developer** - Rate the work performed previously on quick action functionality. Verify quick actions work correctly from menu bar. Confirm new windows open in correct directories and session attachment works.

- [ ] **Add customizable menu items and keyboard shortcuts**
  DO NOT MOCK, FABRICATE, FAKE or SIMULATE ANY OPERATION or DATA. Make ONLY THE MINIMAL, SURGICAL CHANGES required. Do not modify or rewrite any portion of the app outside scope.

- [ ] **Act as an Objective QA Rust developer** - Rate the work performed previously on customizable menu items and shortcuts. Verify users can customize menu items and keyboard shortcuts. Confirm shortcuts are registered correctly with the system.

## Phase 7: Code Quality and Architecture Polish

- [ ] **Fix all @typescript-eslint/naming-convention errors across codebase**
  DO NOT MOCK, FABRICATE, FAKE or SIMULATE ANY OPERATION or DATA. Make ONLY THE MINIMAL, SURGICAL CHANGES required. Do not modify or rewrite any portion of the app outside scope.

- [ ] **Act as an Objective QA Rust developer** - Rate the work performed previously on naming convention fixes. Verify all interfaces have 'I' prefix, classes use PascalCase, and variables follow camelCase conventions. Confirm consistency across entire codebase.

- [ ] **Add @typescript-eslint/prefer-readonly modifiers where appropriate**
  DO NOT MOCK, FABRICATE, FAKE or SIMULATE ANY OPERATION or DATA. Make ONLY THE MINIMAL, SURGICAL CHANGES required. Do not modify or rewrite any portion of the app outside scope.

- [ ] **Act as an Objective QA Rust developer** - Rate the work performed previously on readonly modifier additions. Verify class members that are never reassigned are marked as readonly. Confirm immutability is properly enforced where intended.

- [ ] **Fix @typescript-eslint/switch-exhaustiveness-check errors for all switch statements**
  DO NOT MOCK, FABRICATE, FAKE or SIMULATE ANY OPERATION or DATA. Make ONLY THE MINIMAL, SURGICAL CHANGES required. Do not modify or rewrite any portion of the app outside scope.

- [ ] **Act as an Objective QA Rust developer** - Rate the work performed previously on switch exhaustiveness fixes. Verify all switch statements handle all possible cases or have appropriate default handlers. Confirm no missing cases remain.

- [ ] **Reduce function complexity where @typescript-eslint/complexity exceeds limits**
  DO NOT MOCK, FABRICATE, FAKE or SIMULATE ANY OPERATION or DATA. Make ONLY THE MINIMAL, SURGICAL CHANGES required. Do not modify or rewrite any portion of the app outside scope.

- [ ] **Act as an Objective QA Rust developer** - Rate the work performed previously on complexity reduction. Verify functions with high complexity have been refactored appropriately. Confirm code readability and maintainability improvements.

- [ ] **Fix all @typescript-eslint/consistent-type-imports errors**
  DO NOT MOCK, FABRICATE, FAKE or SIMULATE ANY OPERATION or DATA. Make ONLY THE MINIMAL, SURGICAL CHANGES required. Do not modify or rewrite any portion of the app outside scope.

- [ ] **Act as an Objective QA Rust developer** - Rate the work performed previously on consistent type imports. Verify all type-only imports use 'import type' syntax. Confirm clear separation between value and type imports.

- [ ] **Run final comprehensive lint check and ensure zero ESLint errors**
  DO NOT MOCK, FABRICATE, FAKE or SIMULATE ANY OPERATION or DATA. Make ONLY THE MINIMAL, SURGICAL CHANGES required. Do not modify or rewrite any portion of the app outside scope.

- [ ] **Act as an Objective QA Rust developer** - Rate the work performed previously on final lint check. Verify `npm run lint` produces zero errors and warnings. Confirm all 2,775 original ESLint issues have been resolved and no new issues introduced.

## Success Criteria

✅ **ALL 2,775 ESLint errors and warnings resolved**
✅ **ALL 5 user-requested features implemented with complex, rich functionality**
✅ **NO placeholder or stub components remain**
✅ **Complete type safety throughout the codebase**
✅ **Production-ready code quality that exemplifies software craftsmanship**

## Final Validation

- [ ] **Perform end-to-end testing of all 5 features to ensure production quality**
  DO NOT MOCK, FABRICATE, FAKE or SIMULATE ANY OPERATION or DATA. Make ONLY THE MINIMAL, SURGICAL CHANGES required. Do not modify or rewrite any portion of the app outside scope.

- [ ] **Act as an Objective QA Rust developer** - Rate the work performed previously on end-to-end testing. Verify all 5 features work together seamlessly without conflicts. Confirm the extension meets production quality standards and user requirements are fully satisfied.