import { TestBed } from '@angular/core/testing';

import { TypevehiculeService } from './typevehicule.service';

describe('TypevehiculeService', () => {
  let service: TypevehiculeService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TypevehiculeService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
