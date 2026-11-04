variable "project_id" {
  type = string
  validation {
    condition     = var.project_id == "se-demos-project"
    error_message = "Only se-demos-project is permitted."
  }
}
variable "region" {
  type = string
  validation {
    condition     = var.region == "us-central1"
    error_message = "Only us-central1 is permitted."
  }
}
variable "zone" {
  type = string
  validation {
    condition     = var.zone == "us-central1-a"
    error_message = "Only us-central1-a is permitted."
  }
}
variable "environment" {
  type = string
  validation {
    condition     = var.environment == "demo"
    error_message = "Only the demo environment is permitted."
  }
}
variable "image_digest" {
  type = string
  validation {
    condition     = can(regex("^us-central1-docker\\.pkg\\.dev/se-demos-project/deskdrop/deskdrop@sha256:[a-f0-9]{64}$", var.image_digest))
    error_message = "Use the owned registry and a sha256 digest."
  }
}
