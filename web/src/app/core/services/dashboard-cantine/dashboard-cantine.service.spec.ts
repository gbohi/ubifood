import { TestBed } from '@angular/core/testing';

import { DashboardCantineService } from './dashboard-cantine.service';

describe('DashboardCantineService', () => {
  let service: DashboardCantineService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DashboardCantineService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
