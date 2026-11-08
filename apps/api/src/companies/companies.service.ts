import { Injectable, NotFoundException } from '@nestjs/common';
import type { CompanyDetail, CompanySummary } from '@erp/contracts';
import { searchKey } from '../common/vietnamese';
import { CompaniesRepository } from './companies.repository';

@Injectable()
export class CompaniesService {
  constructor(private readonly repo: CompaniesRepository) {}

  /**
   * The directory is tiny (a few companies), so filtering happens in memory with an
   * accent-insensitive key: "hoa phat" finds "Hòa Phát". This is presentation logic only.
   */
  async list(requestId: string, q?: string): Promise<CompanySummary[]> {
    const [directory, sets] = await Promise.all([this.repo.directory(requestId), this.repo.reportSets(requestId)]);
    const key = searchKey(q ?? '');
    return directory
      .filter((c) => !key || searchKey(c.symbol).includes(key) || searchKey(c.companyName).includes(key))
      .map((c) => ({ ...c, years: sets.filter((s) => s.symbol === c.symbol).map((s) => s.fiscalYear) }));
  }

  async detail(requestId: string, symbol: string): Promise<CompanyDetail> {
    const company = await this.requireCompany(requestId, symbol);
    const sets = await this.repo.reportSets(requestId, symbol);
    return { ...company, reportSets: sets.map(({ symbol: _s, ...rest }) => rest) };
  }

  async requireCompany(requestId: string, symbol: string) {
    const company = await this.repo.findOne(requestId, symbol);
    if (!company) throw new NotFoundException({ code: 'COMPANY_NOT_FOUND', message: `Không tìm thấy doanh nghiệp có mã ${symbol}.` });
    return company;
  }
}
