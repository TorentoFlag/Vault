import { Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";

import { UsersService } from "../users/users.service";
import { CsrfGuard } from "./csrf.guard";
import { CurrentCustomerContext } from "./current-customer";
import { CustomerSessionGuard } from "./customer-session.guard";
import { clearSecureCookie, CUSTOMER_SESSION_COOKIE, parseExactCookie } from "./session-cookies";
import { SessionsService, type CurrentCustomer } from "./sessions.service";

@Controller("session")
export class SessionsController {
  constructor(
    @Inject(SessionsService) private readonly sessions: SessionsService,
    @Inject(UsersService) private readonly users: UsersService,
  ) {}

  @UseGuards(CustomerSessionGuard)
  @Get("me")
  me(@CurrentCustomerContext() customer: CurrentCustomer): ReturnType<UsersService["requireUser"]> {
    const user = this.users.requireUser(customer.userId);
    return {
      id: user.id,
      steam: user.steam,
    };
  }

  @UseGuards(CustomerSessionGuard)
  @Get("csrf")
  csrf(@Req() request: Request): { token: string } {
    const token = parseExactCookie(request.headers.cookie, CUSTOMER_SESSION_COOKIE);
    if (token === null) throw new Error("Authenticated request has no customer cookie");
    return { token: this.sessions.createCsrfToken(token) };
  }

  @UseGuards(CustomerSessionGuard, CsrfGuard)
  @Post("logout")
  @HttpCode(204)
  logout(@Req() request: Request, @Res({ passthrough: true }) response: Response): void {
    const token = parseExactCookie(request.headers.cookie, CUSTOMER_SESSION_COOKIE);
    if (token !== null) this.sessions.revoke(token);
    response.setHeader("Set-Cookie", clearSecureCookie(CUSTOMER_SESSION_COOKIE));
  }
}
