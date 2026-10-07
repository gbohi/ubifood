import { TestBed } from '@angular/core/testing';

import { DashboardsimulationService } from './dashboardsimulation.service';

describe('DashboardsimulationService', () => {
  let service: DashboardsimulationService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DashboardsimulationService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
