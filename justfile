# Run lint analysis
lint:
    @python3 analyze-lint.py

# Run raw npm lint
lint-raw:
    npm run lint

# Run npm lint with fix
lint-fix:
    npm run lint -- --fix

# Run lint and save to file
lint-save:
    npm run lint 2>&1 | tee lint-output.txt