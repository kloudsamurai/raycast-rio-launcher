#!/usr/bin/env python3
"""
Analyzes npm lint output and categorizes errors by file.
"""

import subprocess
import sys
import re
from collections import defaultdict
from typing import Dict, List, Tuple

def run_lint() -> str:
    """Run npm lint and capture output."""
    try:
        result = subprocess.run(
            ["npm", "run", "lint"],
            capture_output=True,
            text=True,
            check=False
        )
        return result.stdout + result.stderr
    except Exception as e:
        print(f"Error running lint: {e}")
        sys.exit(1)

def parse_lint_output(output: str) -> Dict[str, List[Tuple[int, str, str]]]:
    """Parse lint output and group errors by file."""
    errors_by_file = defaultdict(list)
    
    # Pattern to match file paths and errors
    # Example: /path/to/file.ts
    #   12:34  error    Error message    rule-name
    
    current_file = None
    lines = output.split('\n')
    
    for line in lines:
        # Check if this is a file path
        if line.strip() and not line.startswith(' ') and '.ts' in line or '.tsx' in line:
            if '/Volumes/samsung_t9/projects/raycast-cyrup/rio-launcher/' in line:
                current_file = line.strip()
        
        # Check if this is an error/warning line
        elif current_file and line.strip() and re.match(r'^\s+\d+:\d+\s+(error|warning)', line):
            match = re.match(r'^\s+(\d+):(\d+)\s+(error|warning)\s+(.+?)\s+(@?\S+)$', line)
            if match:
                line_num = int(match.group(1))
                col_num = match.group(2)
                severity = match.group(3)
                message = match.group(4).strip()
                rule = match.group(5)
                
                errors_by_file[current_file].append((
                    line_num,
                    f"{line_num}:{col_num} {severity} {message} {rule}",
                    severity
                ))
    
    return errors_by_file

def print_detailed_output(errors_by_file: Dict[str, List[Tuple[int, str, str]]]) -> None:
    """Print detailed output showing all errors by file."""
    print("=" * 100)
    print("DETAILED LINT ERRORS BY FILE")
    print("=" * 100)
    print()
    
    # Sort files by error count (descending)
    sorted_files = sorted(errors_by_file.items(), key=lambda x: len(x[1]), reverse=True)
    
    for file_path, errors in sorted_files:
        # Clean up the file path for display
        display_path = file_path.replace('/Volumes/samsung_t9/projects/raycast-cyrup/rio-launcher/', '')
        
        error_count = sum(1 for _, _, severity in errors if severity == 'error')
        warning_count = sum(1 for _, _, severity in errors if severity == 'warning')
        
        print(f"\n{'=' * 80}")
        print(f"FILE: {display_path}")
        print(f"ERRORS: {error_count}, WARNINGS: {warning_count}, TOTAL: {len(errors)}")
        print(f"{'=' * 80}")
        
        # Sort errors by line number
        sorted_errors = sorted(errors, key=lambda x: x[0])
        
        for _, error_text, _ in sorted_errors:
            print(f"  {error_text}")

def print_summary(errors_by_file: Dict[str, List[Tuple[int, str, str]]]) -> None:
    """Print summary sorted by total issues per file with categorical breakdown."""
    print("\n" + "=" * 100)
    print("SUMMARY BY FILE (sorted by total issues)")
    print("=" * 100)
    print()
    
    # Calculate totals for each file
    file_summaries = []
    total_errors = 0
    total_warnings = 0
    
    for file_path, errors in errors_by_file.items():
        display_path = file_path.replace('/Volumes/samsung_t9/projects/raycast-cyrup/rio-launcher/', '')
        error_count = sum(1 for _, _, severity in errors if severity == 'error')
        warning_count = sum(1 for _, _, severity in errors if severity == 'warning')
        total = len(errors)
        
        # Calculate category breakdown
        categories = defaultdict(int)
        for _, error_text, _ in errors:
            # Extract rule name from error text
            parts = error_text.split()
            if len(parts) > 0:
                rule = parts[-1]  # Rule is typically the last part
                categories[rule] += 1
        
        file_summaries.append((display_path, error_count, warning_count, total, dict(categories)))
        total_errors += error_count
        total_warnings += warning_count
    
    # Sort by total issues (descending)
    file_summaries.sort(key=lambda x: x[3], reverse=True)
    
    # Print each file with category breakdown
    SEPARATOR_WIDTH = 100
    for file_path, error_count, warning_count, total, categories in file_summaries:
        print(f"\n{'=' * SEPARATOR_WIDTH}")
        print(f"{file_path:<60} Errors: {error_count:>5} Warnings: {warning_count:>5} Total: {total:>5}")
        print(f"{'-' * SEPARATOR_WIDTH}")
        
        # Sort categories by count (descending)
        sorted_categories = sorted(categories.items(), key=lambda x: x[1], reverse=True)
        
        # Print top categories
        for rule, count in sorted_categories[:10]:  # Show top 10 categories
            print(f"  {rule:<70} {count:>5}")
        
        if len(sorted_categories) > 10:
            remaining = sum(count for rule, count in sorted_categories[10:])
            print(f"  {'... and ' + str(len(sorted_categories) - 10) + ' more rules':<70} {remaining:>5}")
    
    # Print totals
    print("\n" + "=" * SEPARATOR_WIDTH)
    print(f"{'TOTAL':<60} {total_errors:>10} {total_warnings:>10} {total_errors + total_warnings:>10}")
    print("=" * SEPARATOR_WIDTH)
    print(f"\nTotal files with issues: {len(file_summaries)}")

def main():
    """Main function."""
    print("Running npm lint...")
    output = run_lint()
    
    # Save raw output
    raw_log_path = '/tmp/lint-raw.log'
    with open(raw_log_path, 'w') as f:
        f.write(output)
    
    # Save current lint output with timestamp
    from datetime import datetime
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    current_log_path = f'/tmp/lint-current-{timestamp}.log'
    with open(current_log_path, 'w') as f:
        f.write(output)
    
    # Also save as the "latest" version
    latest_log_path = '/tmp/lint-latest.log'
    with open(latest_log_path, 'w') as f:
        f.write(output)
    
    print(f"\nLogs saved to:")
    print(f"  - Raw: {raw_log_path}")
    print(f"  - Current: {current_log_path}")
    print(f"  - Latest: {latest_log_path}")
    
    # Parse errors
    errors_by_file = parse_lint_output(output)
    
    if not errors_by_file:
        print("\nNo errors found!")
        return
    
    # Print summary
    print_summary(errors_by_file)
    
    # Save detailed output to a file
    detailed_log_path = '/tmp/lint-detailed.log'
    import sys
    original_stdout = sys.stdout
    with open(detailed_log_path, 'w') as f:
        sys.stdout = f
        print_detailed_output(errors_by_file)
        sys.stdout = original_stdout
    
    print(f"\nDetailed output saved to: {detailed_log_path}")

if __name__ == "__main__":
    main()