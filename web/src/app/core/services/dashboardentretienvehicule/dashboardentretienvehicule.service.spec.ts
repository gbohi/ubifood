import { TestBed } from '@angular/core/testing';

import { DashboardEntretienVehiculeService } from './dashboardentretienvehicule.service';

describe('DashboardEntretienVehiculeService', () => {
  let service: DashboardEntretienVehiculeService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DashboardEntretienVehiculeService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
