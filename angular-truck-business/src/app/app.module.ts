// src/app/app.module.ts
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http'; // ⬅️ เพิ่ม HTTP_INTERCEPTORS
import { RouterModule } from '@angular/router';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';

// Components
import { MainComponent } from './layout/main/main.component';

// Charts (ของคุณใช้อยู่)
import { NgChartsModule } from 'ng2-charts';

// ⬅️ นำเข้า Interceptor (ปรับ path ให้ตรงกับไฟล์ที่คุณสร้าง)
import { AuthInterceptor } from './interceptors/auth.interceptor';

@NgModule({
  declarations: [
    AppComponent,
    MainComponent,
  ],
  imports: [
    BrowserModule,
    RouterModule,
    AppRoutingModule,
    FormsModule,
    NgChartsModule,
    HttpClientModule, // ต้องมีเพื่อให้อินเตอร์เซ็ปเตอร์ทำงาน
  ],
  providers: [
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true }, // ⬅️ ลงทะเบียน
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
