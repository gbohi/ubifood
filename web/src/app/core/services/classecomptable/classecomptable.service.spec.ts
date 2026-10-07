import { TestBed } from '@angular/core/testing';

import { ClassecomptableService } from './classecomptable.service';

describe('ClassecomptableService', () => {
  let service: ClassecomptableService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ClassecomptableService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
