import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TypeequipeComponent } from './typeequipe.component';

describe('TypeequipeComponent', () => {
  let component: TypeequipeComponent;
  let fixture: ComponentFixture<TypeequipeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TypeequipeComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TypeequipeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
