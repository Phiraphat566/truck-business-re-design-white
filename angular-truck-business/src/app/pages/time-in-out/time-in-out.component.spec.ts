import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TimeInOutComponent } from './time-in-out.component';

describe('TimeInOutComponent', () => {
  let component: TimeInOutComponent;
  let fixture: ComponentFixture<TimeInOutComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [TimeInOutComponent]
    });
    fixture = TestBed.createComponent(TimeInOutComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
