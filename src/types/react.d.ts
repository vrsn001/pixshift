import "react";

/* eslint-disable @typescript-eslint/no-unused-vars */
declare module "react" {
  interface InputHTMLAttributes<T> {
    webkitdirectory?: string;
    directory?: string;
  }
}
