import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TypebesoinComponent } from './typebesoin.component';

describe('TypebesoinComponent', () => {
  let component: TypebesoinComponent;
  let fixture: ComponentFixture<TypebesoinComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TypebesoinComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TypebesoinComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
