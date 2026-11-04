mock_provider "google" {}
variables {
  project_id   = "se-demos-project"
  region       = "us-central1"
  zone         = "us-central1-a"
  environment  = "demo"
  image_digest = "us-central1-docker.pkg.dev/se-demos-project/deskdrop/deskdrop@sha256:0000000000000000000000000000000000000000000000000000000000000000"
}
run "private_resources" {
  command = plan
  assert {
    condition     = length(google_compute_instance.demo.network_interface[0].access_config) == 0 && google_compute_instance.demo.metadata["enable-oslogin"] == "TRUE"
    error_message = "VM must have no public IP and use OS Login."
  }
  assert {
    condition     = length(google_compute_firewall.iap.source_ranges) == 1 && contains(google_compute_firewall.iap.source_ranges, "35.235.240.0/20") && one(google_compute_firewall.iap.allow).protocol == "tcp" && length(one(google_compute_firewall.iap.allow).ports) == 1 && contains(one(google_compute_firewall.iap.allow).ports, "22")
    error_message = "Only IAP SSH ingress is allowed."
  }
  assert {
    condition     = google_secret_manager_secret_iam_member.intake.role == "roles/secretmanager.secretAccessor" && google_artifact_registry_repository_iam_member.pull.role == "roles/artifactregistry.reader"
    error_message = "Runtime permissions must be resource scoped."
  }
  assert {
    condition     = google_compute_instance.demo.machine_type == "e2-standard-2" && google_compute_instance.demo.boot_disk[0].initialize_params[0].size == 30 && google_compute_instance.demo.boot_disk[0].initialize_params[0].type == "pd-balanced" && google_compute_instance.demo.shielded_instance_config[0].enable_secure_boot && google_compute_instance.demo.shielded_instance_config[0].enable_vtpm && google_compute_instance.demo.shielded_instance_config[0].enable_integrity_monitoring
    error_message = "The VM must use the approved size, disk, and shielded settings."
  }
  assert {
    condition     = google_compute_subnetwork.demo.private_ip_google_access && google_compute_router_nat.demo.source_subnetwork_ip_ranges_to_nat == "LIST_OF_SUBNETWORKS" && length(google_compute_router_nat.demo.subnetwork) == 1
    error_message = "Private Google Access and subnet-limited NAT are required."
  }
  assert {
    condition     = alltrue([for api in google_project_service.api : !api.disable_on_destroy])
    error_message = "Destroy must retain project APIs."
  }
}
run "wrong_project" {
  command = plan
  variables { project_id = "another-project" }
  expect_failures = [var.project_id]
}
run "digest_required" {
  command = plan
  variables { image_digest = "us-central1-docker.pkg.dev/se-demos-project/deskdrop/deskdrop:latest" }
  expect_failures = [var.image_digest]
}
run "wrong_region" {
  command = plan
  variables { region = "europe-west1" }
  expect_failures = [var.region]
}
run "wrong_zone" {
  command = plan
  variables { zone = "us-central1-b" }
  expect_failures = [var.zone]
}
run "wrong_environment" {
  command = plan
  variables { environment = "production" }
  expect_failures = [var.environment]
}
run "wrong_registry" {
  command = plan
  variables { image_digest = "us-central1-docker.pkg.dev/another-project/deskdrop/deskdrop@sha256:0000000000000000000000000000000000000000000000000000000000000000" }
  expect_failures = [var.image_digest]
}
