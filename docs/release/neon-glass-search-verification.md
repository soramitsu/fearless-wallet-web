# Search and picker continuation

The currency picker was passing Vue render arguments to its filter handler, causing `filterValue.trim` to fail. Source `aa090c01` forwards the actual query and tests the real FiatsPopup → SelectPopup → Popup → SearchInput → FInput stack.

Search has a named 48px clear button using existing locale wording. Clear returns focus to the input; Escape clears a nonempty query before a later Escape can dismiss the dialog. IME composition cannot clear the query or dismiss the dialog. Search controls fit inside the input and leave room for text. The original retained field label stays visible.

Qualification: 1,833 unit tests pass with 18 existing skips, TypeScript and changed-file lint pass, and the development extension builds. The final offline Chrome run captures 24 screens plus the toolbar bootstrap check, covering normal/reduced/high-contrast/forced-color rendering, narrow and 200%-equivalent layout space, and English/Russian/Akkadian/Egyptian control labels. All automated geometry and interaction checks pass; seven affected captures were visually inspected. Source, build, logs and captures are pinned in `neon-glass-search-validation.json`. Earlier failures remain recorded.

This completes the search-clearing portion of W-A6. Live result announcements, screen-specific disabled explanations/keyboard behavior, remaining screen composition, real assistive-technology acceptance and final production/distribution gates remain open. Three similar render-argument forwarders in wallet details, custom-node settings and staking history were identified for the next correction; they are not fixed by this commit.
