# Interview Question Bank

Detailed questions for each dimension of the deep-dive interview phase.

## Technical Implementation Questions

- What happens when [edge case X] occurs?
- How should this interact with [existing system Y]?
- What's the expected behavior under [failure condition Z]?
- Should this be synchronous or asynchronous? Why?
- What are the performance constraints or expectations?
- How will this handle concurrent operations?
- What's the rollback strategy if something fails mid-operation?
- How should validation work? Client-side, server-side, or both?
- What data migrations (if any) are needed?
- How will this affect existing API contracts?

## UI/UX Questions

- What should the user see while waiting for [operation X]?
- How should errors be communicated to the user?
- What's the expected flow if the user [does unexpected action Y]?
- Should there be confirmation dialogs? For which actions?
- How does this fit into the existing navigation patterns?
- What accessibility considerations matter here?
- How should this behave on mobile vs desktop?
- What happens if the user navigates away mid-operation?

## Data & State Questions

- What's the source of truth for this data?
- How should stale data be handled?
- What caching strategy makes sense?
- How should this data be persisted?
- What happens to this data when [related entity] is deleted?
- Are there any data consistency concerns across services/tables?

## Security & Privacy Questions

- Who should have access to this feature/data?
- Are there any rate limiting concerns?
- What audit logging is needed?
- How should sensitive data be handled?

## Integration & Dependencies Questions

- What external services does this depend on?
- How should failures in external services be handled?
- Are there any third-party API limitations to consider?
- How does this affect or interact with existing features?

## Tradeoffs & Alternatives Questions

- Why this approach over [alternative approach]?
- What are you willing to compromise on if time is limited?
- Is there a simpler MVP version we should consider first?
- What's the cost of getting this wrong?
- Are there any known limitations we're accepting?

## Future Considerations Questions

- How might this need to evolve in 6 months?
- Are there related features that might affect this design?
- What would make this hard to change later?
- Should this be designed for extensibility or simplicity?
