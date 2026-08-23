# Anonymous-to-account onboarding

## Product decision

Artist Radar lets a new user experience the product before asking them to create an account.
Registration must not interrupt the first analysis: the account prompt appears only after the
user has seen the initial overview and asks to keep, extend, or act on its results.

## Primary flow

1. The user arrives on the landing page.
2. The user selects **Try it with your artist**.
3. The user provides the artist information needed for the analysis.
4. Artist Radar runs one limited analysis and displays a limited first overview.
5. The user can explore the overview and a small selection of opportunities anonymously.
6. Artist Radar prompts the user to create an account when they request an account-only action.

The account prompt must preserve the user's context and explain which requested capability
requires an account. It must not imply that registration is needed to view the anonymous
overview.

## Access rules

| Capability | Anonymous user | Account required |
| --- | --- | --- |
| Run an artist analysis | One limited analysis | Additional, paid, or credit-consuming searches |
| View results | Limited overview and a small opportunity selection | Reopen and retain previous results |
| Explore the product interface | Yes | No |
| Artist profiles | Temporary input for the first analysis | Save an artist or add multiple artists |
| Opportunities | View the anonymous selection | Save opportunities or run deeper searches |
| Contacts | Contact details remain gated | Reveal or save contact details |
| Data freshness | Initial analysis only | Refresh data |
| Results portability | No | Export or share results |

## Account-prompt triggers

Prompt for account creation when an anonymous user attempts to:

- save the artist;
- keep or reopen results;
- add another artist;
- run a deeper, paid, or credit-consuming opportunity search;
- save an opportunity;
- reveal or save contact details;
- refresh data; or
- export or share results.

The prompt is action-driven: browsing the limited overview must never trigger it on its own.

## Anonymous-session boundaries

- Only one limited artist analysis is available without an account.
- The first overview exposes a deliberately limited subset of the full analysis.
- The opportunity list is limited, but every displayed opportunity remains a genuine result.
- Contact details and account-only actions must be visibly gated rather than presented as
  completed actions.
- Anonymous artist input and results are not promised as persistent or recoverable.

Exact result counts, session duration, pricing, credits, and account-provider details are not
defined by this decision. They must be specified separately before enforcement is implemented.

## Acceptance criteria

- Given a new anonymous visitor, when they select **Try it with your artist**, then they can
  reach and submit the artist information form without registering.
- Given a submitted first analysis, when processing completes, then the anonymous user can view
  a limited overview and a small selection of real opportunities.
- Given an anonymous user browsing the limited overview, when they navigate within the allowed
  experience, then no account prompt blocks exploration.
- Given an anonymous user requesting any account-only action, when the action is selected, then
  Artist Radar explains why an account is needed and offers account creation.
- Given an anonymous user has already used the limited analysis, when they request another or a
  deeper analysis, then Artist Radar requires an account before consuming additional resources.
- Given an account prompt is shown, when the user proceeds to account creation, then the product
  retains enough context to return them to the action they requested.

## Out of scope

- Authentication provider selection or implementation
- Account, session, database, billing, or credit-system implementation
- Exact anonymous result limits
- Pricing and plan design
- Account-creation screen design

