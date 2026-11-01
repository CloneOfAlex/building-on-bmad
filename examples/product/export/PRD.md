# Report export
PRD-ID: PRD-EXPORT
Revision: prd-r3
Owner role: product authority

Problem: Authorized users need a faithful export of published reports.
RPT-01: An editor may export a published report as CSV. Each data row
contains its report_id and the approved business values for that report.
RPT-02: A viewer may read a report but cannot export it through the UI
or API. Denial exposes no report content; use the approved API contract.
RPT-03: Draft reports cannot be exported.
RPT-04: An eligible empty report exports a header-only CSV.

Referenced contract: export-api-r2; viewer denial is HTTP 403 with
the exact JSON body {"code":"EXPORT_FORBIDDEN"}.
Open question Q-01: Cross-tenant export behavior needs a product
decision. Keep S-06 blocked; this baseline does not approve that rule.
