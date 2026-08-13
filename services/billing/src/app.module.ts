// billing service — plans, subscriptions, usage metering, entitlement caps,
// invoice generation, and vendor/subscription spend tracking (what the
// tenant pays OUT to third-party SaaS, distinct from what they pay IN via
// plans/invoices above).
import { Module } from '@nestjs/common';
import { CatalogModule } from './catalog/catalog.module';
import { MeteringModule } from './metering/metering.module';
import { InvoicingModule } from './invoicing/invoicing.module';
import { VendorSpendModule } from './vendor-spend/vendor-spend.module';
import { ContractorInvoicesModule } from './contractor-invoices/contractor-invoices.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [CatalogModule, MeteringModule, InvoicingModule, VendorSpendModule, ContractorInvoicesModule, HealthModule],
})
export class AppModule {}
