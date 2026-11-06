#!/usr/bin/env bash
set -euo pipefail
umask 077

# Docker default policy at moby/profiles 4b8214fc4971e06172938a1f1554ccff6647ee80.
# Original SHA256: 6416b47770785a41ac59073cdc77d9fe98517df2799dc83ef207e622de3053f6.
# Namespace extension: playwright cfe490d941f992655948eee8fd4fd94e1c4234bf.
# Chromium also needs chroot after entering its user namespace (no host capability).
seccomp_profile() {
  python3 - <<'PROFILE'
import json
profile = json.loads(r'''{
	"defaultAction": "SCMP_ACT_ERRNO",
	"defaultErrnoRet": 1,
	"archMap": [
		{
			"architecture": "SCMP_ARCH_X86_64",
			"subArchitectures": [
				"SCMP_ARCH_X86",
				"SCMP_ARCH_X32"
			]
		},
		{
			"architecture": "SCMP_ARCH_AARCH64",
			"subArchitectures": [
				"SCMP_ARCH_ARM"
			]
		},
		{
			"architecture": "SCMP_ARCH_MIPS64",
			"subArchitectures": [
				"SCMP_ARCH_MIPS",
				"SCMP_ARCH_MIPS64N32"
			]
		},
		{
			"architecture": "SCMP_ARCH_MIPS64N32",
			"subArchitectures": [
				"SCMP_ARCH_MIPS",
				"SCMP_ARCH_MIPS64"
			]
		},
		{
			"architecture": "SCMP_ARCH_MIPSEL64",
			"subArchitectures": [
				"SCMP_ARCH_MIPSEL",
				"SCMP_ARCH_MIPSEL64N32"
			]
		},
		{
			"architecture": "SCMP_ARCH_MIPSEL64N32",
			"subArchitectures": [
				"SCMP_ARCH_MIPSEL",
				"SCMP_ARCH_MIPSEL64"
			]
		},
		{
			"architecture": "SCMP_ARCH_S390X",
			"subArchitectures": [
				"SCMP_ARCH_S390"
			]
		},
		{
			"architecture": "SCMP_ARCH_RISCV64",
			"subArchitectures": null
		},
		{
			"architecture": "SCMP_ARCH_LOONGARCH64",
			"subArchitectures": null
		}
	],
	"syscalls": [
		{
			"names": [
				"accept",
				"accept4",
				"access",
				"adjtimex",
				"alarm",
				"bind",
				"brk",
				"cachestat",
				"capget",
				"capset",
				"chdir",
				"chmod",
				"chown",
				"chown32",
				"clock_adjtime",
				"clock_adjtime64",
				"clock_getres",
				"clock_getres_time64",
				"clock_gettime",
				"clock_gettime64",
				"clock_nanosleep",
				"clock_nanosleep_time64",
				"close",
				"close_range",
				"connect",
				"copy_file_range",
				"creat",
				"dup",
				"dup2",
				"dup3",
				"epoll_create",
				"epoll_create1",
				"epoll_ctl",
				"epoll_ctl_old",
				"epoll_pwait",
				"epoll_pwait2",
				"epoll_wait",
				"epoll_wait_old",
				"eventfd",
				"eventfd2",
				"execve",
				"execveat",
				"exit",
				"exit_group",
				"faccessat",
				"faccessat2",
				"fadvise64",
				"fadvise64_64",
				"fallocate",
				"fanotify_mark",
				"fchdir",
				"fchmod",
				"fchmodat",
				"fchmodat2",
				"fchown",
				"fchown32",
				"fchownat",
				"fcntl",
				"fcntl64",
				"fdatasync",
				"fgetxattr",
				"flistxattr",
				"flock",
				"fork",
				"fremovexattr",
				"fsetxattr",
				"fstat",
				"fstat64",
				"fstatat64",
				"fstatfs",
				"fstatfs64",
				"fsync",
				"ftruncate",
				"ftruncate64",
				"futex",
				"futex_requeue",
				"futex_time64",
				"futex_wait",
				"futex_waitv",
				"futex_wake",
				"futimesat",
				"getcpu",
				"getcwd",
				"getdents",
				"getdents64",
				"getegid",
				"getegid32",
				"geteuid",
				"geteuid32",
				"getgid",
				"getgid32",
				"getgroups",
				"getgroups32",
				"getitimer",
				"getpeername",
				"getpgid",
				"getpgrp",
				"getpid",
				"getppid",
				"getpriority",
				"getrandom",
				"getresgid",
				"getresgid32",
				"getresuid",
				"getresuid32",
				"getrlimit",
				"get_robust_list",
				"getrusage",
				"getsid",
				"getsockname",
				"getsockopt",
				"get_thread_area",
				"gettid",
				"gettimeofday",
				"getuid",
				"getuid32",
				"getxattr",
				"getxattrat",
				"inotify_add_watch",
				"inotify_init",
				"inotify_init1",
				"inotify_rm_watch",
				"io_cancel",
				"ioctl",
				"io_destroy",
				"io_getevents",
				"io_pgetevents",
				"io_pgetevents_time64",
				"ioprio_get",
				"ioprio_set",
				"io_setup",
				"io_submit",
				"ipc",
				"kill",
				"landlock_add_rule",
				"landlock_create_ruleset",
				"landlock_restrict_self",
				"lchown",
				"lchown32",
				"lgetxattr",
				"link",
				"linkat",
				"listen",
				"listmount",
				"listxattr",
				"listxattrat",
				"llistxattr",
				"_llseek",
				"lremovexattr",
				"lseek",
				"lsetxattr",
				"lstat",
				"lstat64",
				"madvise",
				"map_shadow_stack",
				"membarrier",
				"memfd_create",
				"memfd_secret",
				"mincore",
				"mkdir",
				"mkdirat",
				"mknod",
				"mknodat",
				"mlock",
				"mlock2",
				"mlockall",
				"mmap",
				"mmap2",
				"mprotect",
				"mq_getsetattr",
				"mq_notify",
				"mq_open",
				"mq_timedreceive",
				"mq_timedreceive_time64",
				"mq_timedsend",
				"mq_timedsend_time64",
				"mq_unlink",
				"mremap",
				"mseal",
				"msgctl",
				"msgget",
				"msgrcv",
				"msgsnd",
				"msync",
				"munlock",
				"munlockall",
				"munmap",
				"name_to_handle_at",
				"nanosleep",
				"newfstatat",
				"_newselect",
				"open",
				"openat",
				"openat2",
				"pause",
				"pidfd_open",
				"pidfd_send_signal",
				"pipe",
				"pipe2",
				"pkey_alloc",
				"pkey_free",
				"pkey_mprotect",
				"poll",
				"ppoll",
				"ppoll_time64",
				"prctl",
				"pread64",
				"preadv",
				"preadv2",
				"prlimit64",
				"process_mrelease",
				"pselect6",
				"pselect6_time64",
				"pwrite64",
				"pwritev",
				"pwritev2",
				"read",
				"readahead",
				"readlink",
				"readlinkat",
				"readv",
				"recv",
				"recvfrom",
				"recvmmsg",
				"recvmmsg_time64",
				"recvmsg",
				"remap_file_pages",
				"removexattr",
				"removexattrat",
				"rename",
				"renameat",
				"renameat2",
				"restart_syscall",
				"riscv_hwprobe",
				"rmdir",
				"rseq",
				"rt_sigaction",
				"rt_sigpending",
				"rt_sigprocmask",
				"rt_sigqueueinfo",
				"rt_sigreturn",
				"rt_sigsuspend",
				"rt_sigtimedwait",
				"rt_sigtimedwait_time64",
				"rt_tgsigqueueinfo",
				"sched_getaffinity",
				"sched_getattr",
				"sched_getparam",
				"sched_get_priority_max",
				"sched_get_priority_min",
				"sched_getscheduler",
				"sched_rr_get_interval",
				"sched_rr_get_interval_time64",
				"sched_setaffinity",
				"sched_setattr",
				"sched_setparam",
				"sched_setscheduler",
				"sched_yield",
				"seccomp",
				"select",
				"semctl",
				"semget",
				"semop",
				"semtimedop",
				"semtimedop_time64",
				"send",
				"sendfile",
				"sendfile64",
				"sendmmsg",
				"sendmsg",
				"sendto",
				"setfsgid",
				"setfsgid32",
				"setfsuid",
				"setfsuid32",
				"setgid",
				"setgid32",
				"setgroups",
				"setgroups32",
				"setitimer",
				"setpgid",
				"setpriority",
				"setregid",
				"setregid32",
				"setresgid",
				"setresgid32",
				"setresuid",
				"setresuid32",
				"setreuid",
				"setreuid32",
				"setrlimit",
				"set_robust_list",
				"setsid",
				"setsockopt",
				"set_thread_area",
				"set_tid_address",
				"setuid",
				"setuid32",
				"setxattr",
				"setxattrat",
				"shmat",
				"shmctl",
				"shmdt",
				"shmget",
				"shutdown",
				"sigaltstack",
				"signalfd",
				"signalfd4",
				"sigprocmask",
				"sigreturn",
				"socketcall",
				"socketpair",
				"splice",
				"stat",
				"stat64",
				"statfs",
				"statfs64",
				"statmount",
				"statx",
				"symlink",
				"symlinkat",
				"sync",
				"sync_file_range",
				"syncfs",
				"sysinfo",
				"tee",
				"tgkill",
				"time",
				"timer_create",
				"timer_delete",
				"timer_getoverrun",
				"timer_gettime",
				"timer_gettime64",
				"timer_settime",
				"timer_settime64",
				"timerfd_create",
				"timerfd_gettime",
				"timerfd_gettime64",
				"timerfd_settime",
				"timerfd_settime64",
				"times",
				"tkill",
				"truncate",
				"truncate64",
				"ugetrlimit",
				"umask",
				"uname",
				"unlink",
				"unlinkat",
				"uretprobe",
				"utime",
				"utimensat",
				"utimensat_time64",
				"utimes",
				"vfork",
				"vmsplice",
				"wait4",
				"waitid",
				"waitpid",
				"write",
				"writev"
			],
			"action": "SCMP_ACT_ALLOW"
		},
		{
			"names": [
				"process_vm_readv",
				"process_vm_writev",
				"ptrace"
			],
			"action": "SCMP_ACT_ALLOW",
			"includes": {
				"minKernel": "4.8"
			}
		},
		{
			"names": [
				"socket"
			],
			"action": "SCMP_ACT_ALLOW",
			"args": [
				{
					"index": 0,
					"value": 3,
					"op": "SCMP_CMP_LT"
				}
			]
		},
		{
			"names": [
				"socket"
			],
			"action": "SCMP_ACT_ALLOW",
			"args": [
				{
					"index": 0,
					"value": 7,
					"op": "SCMP_CMP_EQ"
				}
			]
		},
		{
			"names": [
				"socket"
			],
			"action": "SCMP_ACT_ALLOW",
			"args": [
				{
					"index": 0,
					"value": 8,
					"op": "SCMP_CMP_EQ"
				}
			]
		},
		{
			"names": [
				"socket"
			],
			"action": "SCMP_ACT_ALLOW",
			"args": [
				{
					"index": 0,
					"value": 9,
					"op": "SCMP_CMP_EQ"
				}
			]
		},
		{
			"names": [
				"socket"
			],
			"action": "SCMP_ACT_ALLOW",
			"args": [
				{
					"index": 0,
					"value": 10,
					"op": "SCMP_CMP_EQ"
				}
			]
		},
		{
			"names": [
				"socket"
			],
			"action": "SCMP_ACT_ALLOW",
			"args": [
				{
					"index": 0,
					"value": 13,
					"op": "SCMP_CMP_EQ"
				}
			]
		},
		{
			"names": [
				"socket"
			],
			"action": "SCMP_ACT_ALLOW",
			"args": [
				{
					"index": 0,
					"value": 14,
					"op": "SCMP_CMP_EQ"
				}
			]
		},
		{
			"names": [
				"socket"
			],
			"action": "SCMP_ACT_ALLOW",
			"args": [
				{
					"index": 0,
					"value": 15,
					"op": "SCMP_CMP_EQ"
				}
			]
		},
		{
			"names": [
				"socket"
			],
			"action": "SCMP_ACT_ALLOW",
			"args": [
				{
					"index": 0,
					"value": 16,
					"op": "SCMP_CMP_EQ"
				}
			]
		},
		{
			"names": [
				"socket"
			],
			"action": "SCMP_ACT_ALLOW",
			"args": [
				{
					"index": 0,
					"value": 17,
					"op": "SCMP_CMP_EQ"
				}
			]
		},
		{
			"names": [
				"socket"
			],
			"action": "SCMP_ACT_ALLOW",
			"args": [
				{
					"index": 0,
					"value": 18,
					"op": "SCMP_CMP_EQ"
				}
			]
		},
		{
			"names": [
				"socket"
			],
			"action": "SCMP_ACT_ALLOW",
			"args": [
				{
					"index": 0,
					"value": 21,
					"op": "SCMP_CMP_EQ"
				}
			]
		},
		{
			"names": [
				"socket"
			],
			"action": "SCMP_ACT_ALLOW",
			"args": [
				{
					"index": 0,
					"value": 22,
					"op": "SCMP_CMP_EQ"
				}
			]
		},
		{
			"names": [
				"socket"
			],
			"action": "SCMP_ACT_ALLOW",
			"args": [
				{
					"index": 0,
					"value": 24,
					"op": "SCMP_CMP_EQ"
				}
			]
		},
		{
			"names": [
				"socket"
			],
			"action": "SCMP_ACT_ALLOW",
			"args": [
				{
					"index": 0,
					"value": 26,
					"op": "SCMP_CMP_EQ"
				}
			]
		},
		{
			"names": [
				"socket"
			],
			"action": "SCMP_ACT_ALLOW",
			"args": [
				{
					"index": 0,
					"value": 27,
					"op": "SCMP_CMP_EQ"
				}
			]
		},
		{
			"names": [
				"socket"
			],
			"action": "SCMP_ACT_ALLOW",
			"args": [
				{
					"index": 0,
					"value": 28,
					"op": "SCMP_CMP_EQ"
				}
			]
		},
		{
			"names": [
				"socket"
			],
			"action": "SCMP_ACT_ALLOW",
			"args": [
				{
					"index": 0,
					"value": 29,
					"op": "SCMP_CMP_EQ"
				}
			]
		},
		{
			"names": [
				"socket"
			],
			"action": "SCMP_ACT_ALLOW",
			"args": [
				{
					"index": 0,
					"value": 30,
					"op": "SCMP_CMP_EQ"
				}
			]
		},
		{
			"names": [
				"socket"
			],
			"action": "SCMP_ACT_ALLOW",
			"args": [
				{
					"index": 0,
					"value": 31,
					"op": "SCMP_CMP_EQ"
				}
			]
		},
		{
			"names": [
				"socket"
			],
			"action": "SCMP_ACT_ALLOW",
			"args": [
				{
					"index": 0,
					"value": 32,
					"op": "SCMP_CMP_EQ"
				}
			]
		},
		{
			"names": [
				"socket"
			],
			"action": "SCMP_ACT_ALLOW",
			"args": [
				{
					"index": 0,
					"value": 33,
					"op": "SCMP_CMP_EQ"
				}
			]
		},
		{
			"names": [
				"socket"
			],
			"action": "SCMP_ACT_ALLOW",
			"args": [
				{
					"index": 0,
					"value": 35,
					"op": "SCMP_CMP_EQ"
				}
			]
		},
		{
			"names": [
				"socket"
			],
			"action": "SCMP_ACT_ALLOW",
			"args": [
				{
					"index": 0,
					"value": 36,
					"op": "SCMP_CMP_EQ"
				}
			]
		},
		{
			"names": [
				"socket"
			],
			"action": "SCMP_ACT_ALLOW",
			"args": [
				{
					"index": 0,
					"value": 39,
					"op": "SCMP_CMP_EQ"
				}
			]
		},
		{
			"names": [
				"socket"
			],
			"action": "SCMP_ACT_ALLOW",
			"args": [
				{
					"index": 0,
					"value": 41,
					"op": "SCMP_CMP_EQ"
				}
			]
		},
		{
			"names": [
				"socket"
			],
			"action": "SCMP_ACT_ALLOW",
			"args": [
				{
					"index": 0,
					"value": 42,
					"op": "SCMP_CMP_EQ"
				}
			]
		},
		{
			"names": [
				"socket"
			],
			"action": "SCMP_ACT_ALLOW",
			"args": [
				{
					"index": 0,
					"value": 43,
					"op": "SCMP_CMP_EQ"
				}
			]
		},
		{
			"names": [
				"socket"
			],
			"action": "SCMP_ACT_ALLOW",
			"args": [
				{
					"index": 0,
					"value": 44,
					"op": "SCMP_CMP_EQ"
				}
			]
		},
		{
			"names": [
				"socket"
			],
			"action": "SCMP_ACT_ALLOW",
			"args": [
				{
					"index": 0,
					"value": 45,
					"op": "SCMP_CMP_EQ"
				}
			]
		},
		{
			"names": [
				"personality"
			],
			"action": "SCMP_ACT_ALLOW",
			"args": [
				{
					"index": 0,
					"value": 0,
					"op": "SCMP_CMP_EQ"
				}
			]
		},
		{
			"names": [
				"personality"
			],
			"action": "SCMP_ACT_ALLOW",
			"args": [
				{
					"index": 0,
					"value": 8,
					"op": "SCMP_CMP_EQ"
				}
			]
		},
		{
			"names": [
				"personality"
			],
			"action": "SCMP_ACT_ALLOW",
			"args": [
				{
					"index": 0,
					"value": 131072,
					"op": "SCMP_CMP_EQ"
				}
			]
		},
		{
			"names": [
				"personality"
			],
			"action": "SCMP_ACT_ALLOW",
			"args": [
				{
					"index": 0,
					"value": 131080,
					"op": "SCMP_CMP_EQ"
				}
			]
		},
		{
			"names": [
				"personality"
			],
			"action": "SCMP_ACT_ALLOW",
			"args": [
				{
					"index": 0,
					"value": 4294967295,
					"op": "SCMP_CMP_EQ"
				}
			]
		},
		{
			"names": [
				"sync_file_range2",
				"swapcontext"
			],
			"action": "SCMP_ACT_ALLOW",
			"includes": {
				"arches": [
					"ppc64le"
				]
			}
		},
		{
			"names": [
				"arm_fadvise64_64",
				"arm_sync_file_range",
				"sync_file_range2",
				"breakpoint",
				"cacheflush",
				"set_tls"
			],
			"action": "SCMP_ACT_ALLOW",
			"includes": {
				"arches": [
					"arm",
					"arm64"
				]
			}
		},
		{
			"names": [
				"arch_prctl"
			],
			"action": "SCMP_ACT_ALLOW",
			"includes": {
				"arches": [
					"amd64",
					"x32"
				]
			}
		},
		{
			"names": [
				"modify_ldt"
			],
			"action": "SCMP_ACT_ALLOW",
			"includes": {
				"arches": [
					"amd64",
					"x32",
					"x86"
				]
			}
		},
		{
			"names": [
				"s390_pci_mmio_read",
				"s390_pci_mmio_write",
				"s390_runtime_instr"
			],
			"action": "SCMP_ACT_ALLOW",
			"includes": {
				"arches": [
					"s390",
					"s390x"
				]
			}
		},
		{
			"names": [
				"riscv_flush_icache"
			],
			"action": "SCMP_ACT_ALLOW",
			"includes": {
				"arches": [
					"riscv64"
				]
			}
		},
		{
			"names": [
				"open_by_handle_at"
			],
			"action": "SCMP_ACT_ALLOW",
			"includes": {
				"caps": [
					"CAP_DAC_READ_SEARCH"
				]
			}
		},
		{
			"names": [
				"bpf",
				"clone",
				"clone3",
				"fanotify_init",
				"fsconfig",
				"fsmount",
				"fsopen",
				"fspick",
				"lookup_dcookie",
				"lsm_get_self_attr",
				"lsm_list_modules",
				"lsm_set_self_attr",
				"mount",
				"mount_setattr",
				"move_mount",
				"open_tree",
				"perf_event_open",
				"quotactl",
				"quotactl_fd",
				"setdomainname",
				"sethostname",
				"setns",
				"syslog",
				"umount",
				"umount2",
				"unshare"
			],
			"action": "SCMP_ACT_ALLOW",
			"includes": {
				"caps": [
					"CAP_SYS_ADMIN"
				]
			}
		},
		{
			"names": [
				"clone"
			],
			"action": "SCMP_ACT_ALLOW",
			"args": [
				{
					"index": 0,
					"value": 2114060288,
					"op": "SCMP_CMP_MASKED_EQ"
				}
			],
			"excludes": {
				"caps": [
					"CAP_SYS_ADMIN"
				],
				"arches": [
					"s390",
					"s390x"
				]
			}
		},
		{
			"names": [
				"clone"
			],
			"action": "SCMP_ACT_ALLOW",
			"args": [
				{
					"index": 1,
					"value": 2114060288,
					"op": "SCMP_CMP_MASKED_EQ"
				}
			],
			"comment": "s390 parameter ordering for clone is different",
			"includes": {
				"arches": [
					"s390",
					"s390x"
				]
			},
			"excludes": {
				"caps": [
					"CAP_SYS_ADMIN"
				]
			}
		},
		{
			"names": [
				"clone3"
			],
			"action": "SCMP_ACT_ERRNO",
			"errnoRet": 38,
			"excludes": {
				"caps": [
					"CAP_SYS_ADMIN"
				]
			}
		},
		{
			"names": [
				"reboot"
			],
			"action": "SCMP_ACT_ALLOW",
			"includes": {
				"caps": [
					"CAP_SYS_BOOT"
				]
			}
		},
		{
			"names": [
				"chroot"
			],
			"action": "SCMP_ACT_ALLOW",
			"includes": {
				"caps": [
					"CAP_SYS_CHROOT"
				]
			}
		},
		{
			"names": [
				"delete_module",
				"init_module",
				"finit_module"
			],
			"action": "SCMP_ACT_ALLOW",
			"includes": {
				"caps": [
					"CAP_SYS_MODULE"
				]
			}
		},
		{
			"names": [
				"acct"
			],
			"action": "SCMP_ACT_ALLOW",
			"includes": {
				"caps": [
					"CAP_SYS_PACCT"
				]
			}
		},
		{
			"names": [
				"kcmp",
				"pidfd_getfd",
				"process_madvise",
				"process_vm_readv",
				"process_vm_writev",
				"ptrace"
			],
			"action": "SCMP_ACT_ALLOW",
			"includes": {
				"caps": [
					"CAP_SYS_PTRACE"
				]
			}
		},
		{
			"names": [
				"iopl",
				"ioperm"
			],
			"action": "SCMP_ACT_ALLOW",
			"includes": {
				"caps": [
					"CAP_SYS_RAWIO"
				]
			}
		},
		{
			"names": [
				"settimeofday",
				"stime",
				"clock_settime",
				"clock_settime64"
			],
			"action": "SCMP_ACT_ALLOW",
			"includes": {
				"caps": [
					"CAP_SYS_TIME"
				]
			}
		},
		{
			"names": [
				"vhangup"
			],
			"action": "SCMP_ACT_ALLOW",
			"includes": {
				"caps": [
					"CAP_SYS_TTY_CONFIG"
				]
			}
		},
		{
			"names": [
				"get_mempolicy",
				"mbind",
				"set_mempolicy",
				"set_mempolicy_home_node"
			],
			"action": "SCMP_ACT_ALLOW",
			"includes": {
				"caps": [
					"CAP_SYS_NICE"
				]
			}
		},
		{
			"names": [
				"syslog"
			],
			"action": "SCMP_ACT_ALLOW",
			"includes": {
				"caps": [
					"CAP_SYSLOG"
				]
			}
		},
		{
			"names": [
				"bpf"
			],
			"action": "SCMP_ACT_ALLOW",
			"includes": {
				"caps": [
					"CAP_BPF"
				]
			}
		},
		{
			"names": [
				"perf_event_open"
			],
			"action": "SCMP_ACT_ALLOW",
			"includes": {
				"caps": [
					"CAP_PERFMON"
				]
			}
		}
	]
}''')
profile['syscalls'].insert(0, {'names': ['clone', 'setns', 'unshare', 'chroot'], 'action': 'SCMP_ACT_ALLOW', 'comment': 'Chromium user namespace sandbox and chroot inside that namespace'})
print(json.dumps(profile, sort_keys=True, separators=(',', ':')))
PROFILE
}
profile_sha=6c0dc8f64ae4dcd440ae2a009c4399f8ac52e0cd3a325a0b9ade5bd7386ce18c
mode=${1:-}
command -v python3 >/dev/null || { printf 'Python 3 required\n' >&2; exit 1; }
if [ "$mode" = seccomp-profile ]; then [ "$#" -eq 1 ] || exit 2; seccomp_profile; exit; fi

# All write operations require explicit root invocation on the approved VM.
[ "$(id -u)" = 0 ] || { printf 'Root required\n' >&2; exit 1; }

firewall() {
  command -v iptables >/dev/null && command -v ip6tables >/dev/null || return 1
  iptables -nL DOCKER-USER >/dev/null 2>&1 || iptables -N DOCKER-USER
  iptables -C FORWARD -j DOCKER-USER 2>/dev/null || iptables -I FORWARD 1 -j DOCKER-USER
  for bridge in br-deskdrop br-deskdrop-in; do
    subnet=172.30.243.0/24
    [ "$bridge" != br-deskdrop-in ] || subnet=172.30.244.0/24
    iptables -C DOCKER-USER -i "$bridge" ! -d "$subnet" -j DROP 2>/dev/null || iptables -I DOCKER-USER 1 -i "$bridge" ! -d "$subnet" -j DROP
    iptables -C INPUT -i "$bridge" -j DROP 2>/dev/null || iptables -I INPUT 1 -i "$bridge" -j DROP
    # Insert reply exceptions ahead of the deny rules, including on an older install.
    iptables -C DOCKER-USER -i "$bridge" -m conntrack --ctstate ESTABLISHED -j RETURN 2>/dev/null || iptables -I DOCKER-USER 1 -i "$bridge" -m conntrack --ctstate ESTABLISHED -j RETURN
    iptables -C INPUT -i "$bridge" -m conntrack --ctstate ESTABLISHED -j ACCEPT 2>/dev/null || iptables -I INPUT 1 -i "$bridge" -m conntrack --ctstate ESTABLISHED -j ACCEPT
    ip6tables -C FORWARD -i "$bridge" -j DROP 2>/dev/null || ip6tables -I FORWARD 1 -i "$bridge" -j DROP
    ip6tables -C INPUT -i "$bridge" -j DROP 2>/dev/null || ip6tables -I INPUT 1 -i "$bridge" -j DROP
    iptables -C DOCKER-USER -i "$bridge" ! -d "$subnet" -j DROP
    iptables -C INPUT -i "$bridge" -j DROP
    iptables -C DOCKER-USER -i "$bridge" -m conntrack --ctstate ESTABLISHED -j RETURN
    iptables -C INPUT -i "$bridge" -m conntrack --ctstate ESTABLISHED -j ACCEPT
    ip6tables -C FORWARD -i "$bridge" -j DROP
    ip6tables -C INPUT -i "$bridge" -j DROP
  done
  iptables -C OUTPUT -d 169.254.169.254/32 -m owner ! --uid-owner 0 -j REJECT 2>/dev/null || iptables -I OUTPUT 1 -d 169.254.169.254/32 -m owner ! --uid-owner 0 -j REJECT
  ip6tables -C OUTPUT -d fd20:ce::254/128 -m owner ! --uid-owner 0 -j REJECT 2>/dev/null || ip6tables -I OUTPUT 1 -d fd20:ce::254/128 -m owner ! --uid-owner 0 -j REJECT

}

install_profile() {
  local profile_temp
  profile_temp=$(mktemp /opt/deskdrop/seccomp.XXXXXXXX)
  if ! seccomp_profile > "$profile_temp" || ! printf '%s  %s\n' "$profile_sha" "$profile_temp" | sha256sum -c - >/dev/null; then
    rm -f -- "$profile_temp"; return 1
  fi
  chmod 0600 "$profile_temp"
  mv -f -- "$profile_temp" /opt/deskdrop/checker-seccomp.json
}
verify_profile() {
  [ -f /opt/deskdrop/checker-seccomp.json ] && [ ! -L /opt/deskdrop/checker-seccomp.json ] && [ "$(stat -c '%u:%a:%h' /opt/deskdrop/checker-seccomp.json)" = '0:600:1' ] || return 1
  printf '%s  %s\n' "$profile_sha" /opt/deskdrop/checker-seccomp.json | sha256sum -c - >/dev/null
}
runtime_command() { /opt/deskdrop/bootstrap.sh "$@"; }
compose() {
  APP_IMAGE=$app_image CHECKER_IMAGE=$checker_image SOURCE_COMMIT=$source_commit timeout --kill-after=5s 90s docker compose -f /opt/deskdrop/compose.yaml "$@"
}
resume_services() {
  runtime_command verify-images "$app_image" "$checker_image" "$source_commit"
  compose up -d --pull never --wait --wait-timeout 60 app forwarder
  if runtime_command secret-refresh; then
    if compose up -d --pull never --force-recreate agent; then return 0; fi
  fi
  compose stop agent
  printf 'Telemetry degraded; Agent stopped; app remains running\n' >&2
}

install_packages() {
  . /etc/os-release
  [ "${ID:-}" = ubuntu ] && [ "${VERSION_ID:-}" = 24.04 ] && [ "$(dpkg --print-architecture)" = amd64 ] || { printf 'Ubuntu 24.04 amd64 required\n' >&2; return 1; }
  for tool in curl gpg apt-get sha256sum systemctl iptables ip6tables timeout; do command -v "$tool" >/dev/null || return 1; done
  firewall
  temp_dir=$(mktemp -d /run/deskdrop-install.XXXXXXXX)
  trap 'rm -rf -- "$temp_dir"' EXIT
  curl --proto '=https' --proto-redir '=https' --fail --silent --show-error --location --max-time 30 https://download.docker.com/linux/ubuntu/gpg -o "$temp_dir/key.asc"
  fingerprint=$(gpg --show-keys --with-colons "$temp_dir/key.asc" | awk -F: '$1=="fpr" {print $10; exit}')
  [ "$fingerprint" = 9DC858229FC7DD38854AE2D88D81803C0EBFCD88 ] || { printf 'Docker signing key mismatch\n' >&2; return 1; }
  gpg --dearmor < "$temp_dir/key.asc" > "$temp_dir/docker.gpg"
  install -d -m 0755 /etc/apt/keyrings
  install -m 0644 "$temp_dir/docker.gpg" /etc/apt/keyrings/deskdrop-docker.gpg
  printf '%s\n' 'deb [arch=amd64 signed-by=/etc/apt/keyrings/deskdrop-docker.gpg] https://download.docker.com/linux/ubuntu noble stable' > /etc/apt/sources.list.d/deskdrop-docker.list
  apt-get -o Acquire::AllowInsecureRepositories=false -o APT::Get::AllowUnauthenticated=false update
  (cd "$temp_dir" && apt-get -o Acquire::AllowInsecureRepositories=false -o APT::Get::AllowUnauthenticated=false download 'docker-ce=5:29.9.3-1~ubuntu.24.04~noble' 'docker-ce-cli=5:29.9.3-1~ubuntu.24.04~noble' 'containerd.io=2.4.2-3~ubuntu.24.04~noble' 'docker-buildx-plugin=0.38.1-1~ubuntu.24.04~noble' 'docker-compose-plugin=5.7.0-1~ubuntu.24.04~noble')
  for entry in     'docker-ce c546181f0bc5f1d19085d764a3219aa86069468dbee4743fae420ee8a31809a4'     'docker-ce-cli 24f78a893cece8d345c4e90b5163907c047b996b747265f873743e8b0b0546d4'     'containerd.io f811ab57d1f4bb0cce19df7d526da8c711d8ebea0447cc83da1999188e664122'     'docker-buildx-plugin 642e9a8a0d115a8a57ad7045a4c7c2561522331197f0c087a762de1b72591672'     'docker-compose-plugin 61dd23ec4d0f6e4a99ef841f2ea2c0dc9cbada2c6ad99ffbd4f980ae957cc691'; do
    read -r package digest <<< "$entry"
    matches=("$temp_dir"/"$package"_*.deb)
    [ "${#matches[@]}" -eq 1 ] && [ -f "${matches[0]}" ] || return 1
    printf '%s  %s\n' "$digest" "${matches[0]}" | sha256sum -c -
  done
  DEBIAN_FRONTEND=noninteractive apt-get -o APT::Get::AllowUnauthenticated=false install --no-install-recommends -y "$temp_dir"/*.deb
  firewall
  install -d -m 0700 /opt/deskdrop /etc/deskdrop
  install_profile
  cat > /etc/systemd/system/deskdrop-firewall.service <<'UNIT'
[Unit]
Description=DeskDrop container isolation
Wants=network-online.target
After=network-online.target
Before=docker.service
[Service]
Type=oneshot
ExecStart=/opt/deskdrop/bootstrap.sh firewall
TimeoutStartSec=45
RemainAfterExit=yes
[Install]
RequiredBy=docker.service
UNIT
  cat > /etc/systemd/system/deskdrop.service <<'UNIT'
[Unit]
Description=DeskDrop private demo
Requires=docker.service deskdrop-firewall.service
After=docker.service deskdrop-firewall.service network-online.target
[Service]
Type=oneshot
ExecStart=/opt/deskdrop/bootstrap.sh restart
TimeoutStartSec=420
RemainAfterExit=yes
[Install]
WantedBy=multi-user.target
UNIT
  systemctl daemon-reload
  systemctl enable deskdrop-firewall.service deskdrop.service
}

monitoring() {
  exec -- python3 - "$@" <<'MONITORING'
import contextlib,fcntl,gzip,hashlib,io,json,os,re,signal,stat,subprocess,sys,tarfile,tempfile,time
CONTROL='node:24.13.0-bookworm-slim@sha256:46feb5752989c05b8606e6323fbbc3db667d14ade1c24f5d0d44d9ca9909d607'
MODULES={'cloud-runtime.mjs','cloud-monitors.mjs','deskdrop-monitoring.service'}
FILES=MODULES|{'manifest.json','runtime.json'}
BASE='/opt/deskdrop/monitoring'
STATE='/var/lib/deskdrop/monitoring'
ENV={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin','DOCKER_CONFIG':'/run/deskdrop'}

def safe_dir(p,uid=0,private=False):
    if os.path.realpath(p)!=p or not os.path.isabs(p): raise ValueError('Unsafe path')
    current=p
    while True:
        st=os.lstat(current)
        if not stat.S_ISDIR(st.st_mode) or st.st_uid not in ({uid} if current==p else {0,uid}) or st.st_mode&0o022 or (private and current==p and stat.S_IMODE(st.st_mode)!=0o700): raise ValueError('Unsafe directory')
        if current=='/': break
        current=os.path.dirname(current)

def read(p,uid=0,mode=0o600,limit=262144):
    safe_dir(os.path.dirname(p),uid)
    fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW)
    with os.fdopen(fd,'rb') as f:
        st=os.fstat(f.fileno())
        if not stat.S_ISREG(st.st_mode) or st.st_uid!=uid or st.st_nlink!=1 or stat.S_IMODE(st.st_mode)!=mode or st.st_size>limit: raise ValueError('Unsafe file')
        return f.read(limit+1)

def syncdir(p):
    fd=os.open(p,os.O_RDONLY|os.O_DIRECTORY)
    try: os.fsync(fd)
    finally: os.close(fd)

def atomic(p,data):
    safe_dir(os.path.dirname(p),private=True)
    if os.path.lexists(p): read(p)
    fd,tmp=tempfile.mkstemp(prefix='.monitoring-',dir=os.path.dirname(p))
    try:
        with os.fdopen(fd,'wb') as f: f.write(data);f.flush();os.fsync(f.fileno())
        os.replace(tmp,p);syncdir(os.path.dirname(p))
    finally:
        if os.path.exists(tmp):os.unlink(tmp)

def identity(c):
    if c.get('project')!='se-demos-project' or c.get('zone')!='us-central1-a' or c.get('architecture')!='linux/amd64' or not re.fullmatch(r'(?!0{40}$)[a-f0-9]{40}',c.get('source','')): raise ValueError('Wrong source identity')
    for key,repo in [('app','deskdrop'),('checker','checker')]:
        if not re.fullmatch(r'us-central1-docker\.pkg\.dev/se-demos-project/deskdrop/'+repo+r'@sha256:(?!0{64}$)[a-f0-9]{64}',c.get(key,'')):raise ValueError('Wrong image')
    if not re.fullmatch(r'[a-f0-9]{64}',c.get('bundleHash','')):raise ValueError('Wrong bundle identity')

def bundle(raw,digest,release):
    if len(raw)>1048576 or hashlib.sha256(raw).hexdigest()!=digest:raise ValueError('Bundle digest mismatch')
    # Bound expansion before tar parsing; no filesystem extraction.
    with gzip.GzipFile(fileobj=io.BytesIO(raw)) as gz: plain=gz.read(2097153)
    if len(plain)>2097152:raise ValueError('Bundle too large')
    with tarfile.open(fileobj=io.BytesIO(plain),mode='r:') as t:
        members=t.getmembers()
        if len(members)!=5 or {m.name for m in members}!=FILES or any(not m.isfile() or m.size>262144 for m in members):raise ValueError('Invalid bundle members')
        files={m.name:t.extractfile(m).read() for m in members}
    c=json.loads(files['runtime.json']);m=json.loads(files['manifest.json']);identity(c)
    if set(c)!={'project','zone','architecture','source','app','checker','bundleHash'} or release!=[c['app'],c['checker'],c['source']] or m.get('commit')!=c['source'] or set(m.get('files',{}))!=MODULES or hashlib.sha256(files['manifest.json']).hexdigest()!=c['bundleHash']:raise ValueError('Wrong release bundle')
    for n,d in m['files'].items():
        if hashlib.sha256(files[n]).hexdigest()!=d:raise ValueError('Wrong module hash')
    return files,c,m

def docker(*args,timeout=15):
    return subprocess.run(['docker',*args],env=ENV,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,check=True,timeout=timeout).stdout.decode().strip()

def installed():
    safe_dir(BASE,private=True);safe_dir(STATE,private=True)
    files={n:read(BASE+'/'+n) for n in FILES}
    c=json.loads(files['runtime.json']);identity(c);m=json.loads(files['manifest.json'])
    receipt=json.loads(read(STATE+'/bundle.json'))
    if not re.fullmatch(r'cloud_owner:[a-f0-9]{32}',c.get('owner','')) or set(m.get('files',{}))!=MODULES or m.get('commit')!=c['source'] or hashlib.sha256(files['manifest.json']).hexdigest()!=c['bundleHash'] or receipt.get('manifestHash')!=c['bundleHash'] or receipt.get('source')!=c['source'] or receipt.get('files')!=m['files']:raise ValueError('Installed source mismatch')
    if read('/etc/deskdrop/release').decode().splitlines()!=[c['app'],c['checker'],c['source']]:raise ValueError('Installed release mismatch')
    for n in MODULES:
        if hashlib.sha256(files[n]).hexdigest()!=m['files'][n]:raise ValueError('Installed module changed')
    return c

@contextlib.contextmanager
def lock(name,uid=0):
    safe_dir(STATE,uid,private=True)
    p=STATE+'/'+name
    fd=os.open(p,os.O_RDWR|os.O_CREAT|os.O_NOFOLLOW,0o600)
    try:
        st=os.fstat(fd)
        if not stat.S_ISREG(st.st_mode) or st.st_uid!=uid or st.st_nlink!=1 or stat.S_IMODE(st.st_mode)!=0o600:raise ValueError('Unsafe lock')
        fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB);yield
    finally:os.close(fd)

def labels(c,kind):
    return {'managed_by':'deskdrop-gcp-controller','deskdrop.cloud_owner':c['owner'],'deskdrop.source':c['source'],'deskdrop.bundle':c['bundleHash'],'deskdrop.kind':kind}

def owned_container(c,kind):
    name='deskdrop-cloud-'+kind
    rows=docker('container','ls','--all','--format','{{.Names}}').splitlines()
    if name not in rows:return None
    records=json.loads(docker('inspect',name))
    if len(records)!=1:raise ValueError('Ambiguous control container')
    r=records[0]
    if r.get('Config',{}).get('Image')!=CONTROL or r['Config'].get('Labels')!=labels(c,kind) or not re.fullmatch(r'[a-f0-9]{64}',r.get('Id','')):raise ValueError('Unowned control container')
    h=r.get('HostConfig',{})
    if h.get('NetworkMode')!='host' or h.get('ReadonlyRootfs') is not True or h.get('Privileged') or h.get('CapAdd') or h.get('CapDrop')!=['ALL'] or not any(x in h.get('SecurityOpt',[]) for x in ['no-new-privileges','no-new-privileges:true']):raise ValueError('Control policy mismatch')
    args=options(c,kind);wanted={}
    for i,v in enumerate(args):
        if v=='-v':
            parts=args[i+1].split(':');wanted[parts[1]]=(parts[0],len(parts)==2)
    mounts=r.get('Mounts',[])
    if len(mounts)!=len(wanted) or any(m.get('Type')!='bind' or wanted.get(m.get('Destination'))!=(m.get('Source'),m.get('RW')) for m in mounts):raise ValueError('Control mount mismatch')
    return r

def stop_owned(c,kind):
    r=owned_container(c,kind)
    if not r:return
    if r['State']['Running']:
        try:docker('stop','--time','35',r['Id'],timeout=40)
        except (subprocess.SubprocessError,OSError):pass
    r=owned_container(c,kind)
    if r and r['State']['Running']:
        docker('kill',r['Id']);r=owned_container(c,kind)
    if r and r['State']['Running']:raise ValueError('Control cleanup unconfirmed')
    if r:docker('rm',r['Id'])
    if owned_container(c,kind):raise ValueError('Control removal unconfirmed')

def options(c,kind):
    args=['--pull','never','--name','deskdrop-cloud-'+kind,'--network','host','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','128m','--cpus','0.25']
    for k,v in labels(c,kind).items():args+=['--label',k+'='+v]
    args+=['-v',BASE+':'+BASE+':ro','-v',STATE+':'+STATE+(':ro' if kind=='heartbeat' else '')]
    if kind in ('controller','cleanup'):args+=['-v','/var/run/docker.sock:/var/run/docker.sock','-v','/opt/deskdrop/checker-seccomp.json:/opt/deskdrop/checker-seccomp.json:ro']
    if kind=='installer':args+=['-v','/run/deskdrop-management:/run/deskdrop-management:ro']
    return args

def install(digest,transfer='/tmp/monitoring.tar.gz',release_path='/etc/deskdrop/release',unit='/etc/systemd/system/deskdrop-monitoring.service'):
    if not re.fullmatch(r'[a-f0-9]{64}',digest):raise ValueError('Invalid bundle digest')
    fd=os.open(transfer,os.O_RDONLY|os.O_NOFOLLOW)
    with os.fdopen(fd,'rb') as f:
        if not stat.S_ISREG(os.fstat(f.fileno()).st_mode):raise ValueError('Invalid transfer file')
        raw=f.read(1048577)
    files,c,m=bundle(raw,digest,read(release_path).decode().splitlines())
    for p in [os.path.dirname(STATE),STATE]:
        safe_dir(os.path.dirname(p))
        try:os.mkdir(p,0o700)
        except FileExistsError:pass
        safe_dir(p,private=True)
    with lock('bundle.lock'):
        try:state=json.loads(read(STATE+'/installation.json'))
        except FileNotFoundError:
            state={'schema':1,'owner':'cloud_owner:'+os.urandom(16).hex(),'monitors':[],'pending':None}
            atomic(STATE+'/installation.json',json.dumps(state).encode())
        if state.get('schema')!=1 or not re.fullmatch(r'cloud_owner:[a-f0-9]{32}',state.get('owner','')):raise ValueError('Invalid existing journal')
        c['owner']=state['owner'];files['runtime.json']=json.dumps(c).encode()
        receipt={'status':'monitoring-bundle-installed','source':c['source'],'bundleHash':digest,'manifestHash':c['bundleHash'],'files':m['files']}
        # Retry of an identical transfer is safe, including a lost SSH response.
        if os.path.lexists(BASE):
            safe_dir(BASE,private=True)
            if set(os.listdir(BASE))!=FILES or any(read(BASE+'/'+n)!=data for n,data in files.items()):raise ValueError('Existing release requires explicit migration; preserve state')
        else:
            safe_dir(os.path.dirname(BASE),private=True)
            staging=tempfile.mkdtemp(prefix='.monitoring-',dir=os.path.dirname(BASE))
            try:
                for n,data in files.items():atomic(staging+'/'+n,data)
                os.rename(staging,BASE);syncdir(os.path.dirname(BASE))
            finally:
                if os.path.exists(staging):
                    for n in os.listdir(staging):os.unlink(staging+'/'+n)
                    os.rmdir(staging)
        if os.path.lexists(STATE+'/bundle.json') and json.loads(read(STATE+'/bundle.json'))!=receipt:raise ValueError('Existing bundle receipt mismatch')
        atomic(STATE+'/bundle.json',json.dumps(receipt).encode())
        docker('pull','--platform','linux/amd64',CONTROL,timeout=120)
        if docker('image','inspect','--format','{{.Architecture}}|{{.Os}}',CONTROL)!='amd64|linux':raise ValueError('Wrong control architecture')
        if docker('run','--rm','--pull','never','--network','none','--read-only',CONTROL,'node','--version')!='v24.13.0':raise ValueError('Wrong control runtime')
        safe_dir(os.path.dirname(unit))
        if os.path.lexists(unit) and read(unit,mode=0o644)!=files['deskdrop-monitoring.service']:raise ValueError('Existing unit is not this bundle; preserve it')
        subprocess.run(['install','-m','0644',BASE+'/deskdrop-monitoring.service',unit],check=True,timeout=10)
        subprocess.run(['systemctl','daemon-reload'],check=True,timeout=15)
        print(json.dumps(receipt))

def manage(c,mode):
    with lock('lifecycle.lock'):
        for kind in ['controller','heartbeat']:
            if owned_container(c,kind):raise ValueError('Stop monitoring service before management operations')
        r=owned_container(c,'installer')
        if r and r['State']['Running']:raise ValueError('Previous installer still running; outcome unknown')
        if r:stop_owned(c,'installer')
        # Docker name + host flock exclude a live installer. Empty stale journal lock
        # from a killed container is now safely recoverable; intent remains untouched.
        p=STATE+'/installation.lock'
        if os.path.lexists(p):safe_dir(p,private=True);os.rmdir(p);syncdir(STATE)
        try:
            subprocess.run(['/opt/deskdrop/bootstrap.sh','management-refresh'],check=True,timeout=45)
            result=docker('run',*options(c,'installer'),CONTROL,'node',BASE+'/cloud-monitors.mjs',mode,timeout=300)
            print(result)
        finally:
            # A timed-out client can leave its container alive. Retain it for explicit
            # reconciliation, but remove the host secret path (no retry write).
            try:os.unlink('/run/deskdrop-management/management')
            except FileNotFoundError:pass
        stop_owned(c,'installer')

def supervise(c):
    with lock('lifecycle.lock'):
        installer=owned_container(c,'installer')
        if installer and installer.get('State',{}).get('Running') is not False:raise ValueError('Installer outcome unknown; reconcile before service restart')
        state=json.loads(read(STATE+'/installation.json'))
        if state.get('owner')!=c['owner'] or state.get('verified') is not True or state.get('pending') or len(state.get('monitors',[]))!=3:raise ValueError('Protected installation required')
        stopping=False
        def stop(*args):
            nonlocal stopping
            stopping=True
        signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
        try:
            for kind in ['controller','heartbeat']:stop_owned(c,kind)
            # Invalidate health before launching the independently supervised heartbeat.
            atomic(STATE+'/health.json',json.dumps({'healthy':False,'updated':0,'owner':c['owner'],'source':c['source']}).encode())
            for kind in ['heartbeat','controller']:
                docker('run','-d',*options(c,kind),CONTROL,'node',BASE+'/cloud-runtime.mjs',kind)
            while not stopping:
                for kind in ['controller','heartbeat']:
                    r=owned_container(c,kind)
                    if not r or not r['State']['Running']:raise ValueError('Monitoring process exited')
                time.sleep(1)
        finally:
            for kind in ['controller','heartbeat']:stop_owned(c,kind)
            # A killed controller may have left a browser container. Reuse the same
            # source-bound cleanup adapter before declaring the service stopped.
            r=owned_container(c,'cleanup')
            if r and r['State']['Running']:raise ValueError('Cleanup already running')
            if r:stop_owned(c,'cleanup')
            docker('run',*options(c,'cleanup'),CONTROL,'node',BASE+'/cloud-runtime.mjs','cleanup',timeout=60)
            stop_owned(c,'cleanup')

def main():
    if os.getuid()!=0:raise ValueError('Root required')
    mode=sys.argv[1]
    if mode=='monitoring-install':install(sys.argv[2]);return
    c=installed()
    subprocess.run(['/opt/deskdrop/bootstrap.sh','verify'],check=True,timeout=30)
    if mode=='monitoring-start':
        subprocess.run(['/opt/deskdrop/bootstrap.sh','verify-images',c['app'],c['checker'],c['source']],check=True,timeout=45)
        supervise(c)
    elif mode in ('monitoring-protect','monitoring-inspect','monitoring-delete'):manage(c,{'monitoring-protect':'install','monitoring-inspect':'inspect','monitoring-delete':'delete'}[mode])
    else:raise ValueError('Invalid monitoring operation')
if __name__=='__main__':
    try:main()
    except Exception:print('Monitoring failed; preserve journal and reconcile exact owned resources',file=sys.stderr);sys.exit(1)
MONITORING
}

case "$mode" in
  monitoring-install) [ "$#" -eq 2 ] || exit 2; runtime_command verify; monitoring "$@"; exit ;;
  monitoring-start|monitoring-protect|monitoring-inspect|monitoring-delete) [ "$#" -eq 1 ] || exit 2; monitoring "$@"; exit ;;
  install) [ "$#" -eq 1 ] || exit 2; "${BASH_SOURCE[0]}" verify; install_packages; exit ;;
  firewall) [ "$#" -eq 1 ] || exit 2; firewall; runtime_command verify; runtime_command prepare-runtime; exit ;;
  prepare-runtime) [ "$#" -eq 1 ] || exit 2 ;;
  secret-refresh|management-refresh) [ "$#" -eq 1 ] || exit 2 ;;
  verify) [ "$#" -eq 1 ] || exit 2 ;;
  start|restart|check)
    if [ "$mode" = start ]; then
      [ "$#" -eq 4 ] || exit 2
      app_image=$2 checker_image=$3 source_commit=$4
    else
      [ "$#" -eq 1 ] || exit 2
      release=/etc/deskdrop/release
      [ -f "$release" ] && [ ! -L "$release" ] && [ "$(stat -c '%u:%a:%h' "$release")" = '0:600:1' ] || { printf 'Unsafe release file\n' >&2; exit 1; }
      mapfile -t release_values < "$release"
      [ "${#release_values[@]}" -eq 3 ] || exit 1
      app_image=${release_values[0]} checker_image=${release_values[1]} source_commit=${release_values[2]}
    fi
    [[ $app_image =~ ^us-central1-docker\.pkg\.dev/se-demos-project/deskdrop/deskdrop@sha256:[a-f0-9]{64}$ ]] || exit 2
    [[ $checker_image =~ ^us-central1-docker\.pkg\.dev/se-demos-project/deskdrop/checker@sha256:[a-f0-9]{64}$ ]] || exit 2
    [[ $source_commit =~ ^[a-f0-9]{40}$ ]] || exit 2
    "${BASH_SOURCE[0]}" verify
    firewall
    verify_profile
    runtime_command prepare-runtime
    if [ "$mode" = restart ]; then
      resume_services
    elif [ "$mode" = start ]; then
      /opt/deskdrop/bootstrap.sh host-auth "$app_image" "$checker_image" "$source_commit"
      printf '%s\n%s\n%s\n' "$app_image" "$checker_image" "$source_commit" > /etc/deskdrop/release.tmp
      chmod 0600 /etc/deskdrop/release.tmp
      mv -f /etc/deskdrop/release.tmp /etc/deskdrop/release
      compose up -d --pull never --force-recreate app forwarder agent
    else
      [ "$(docker inspect --format '{{.Config.Image}}' deskdrop-app-1)" = "$app_image" ] || { printf 'Deployed image mismatch\n' >&2; exit 1; }
      APP_IMAGE=$app_image CHECKER_IMAGE=$checker_image SOURCE_COMMIT=$source_commit docker compose -f /opt/deskdrop/compose.yaml --profile check run --rm checker
    fi
    exit ;;
  host-auth|verify-images) [ "$#" -eq 4 ] || exit 2 ;;
  *) printf 'Expected install, firewall, or host-auth\n' >&2; exit 2 ;;
esac
exec python3 - "$mode" "${@:2}" <<'PYCODE'
import base64
import json
import os
import re
import resource
import stat
import subprocess
import tempfile
import sys
import urllib.error
import urllib.request

PROJECT = 'se-demos-project'
ZONE = 'us-central1-a'
INSTANCE = 'deskdrop-demo'
SERVICE_ACCOUNT = 'deskdrop-demo-runtime@se-demos-project.iam.gserviceaccount.com'
REGISTRY = 'us-central1-docker.pkg.dev'
META = 'http://metadata.google.internal/computeMetadata/v1/'
SECRET = 'https://secretmanager.googleapis.com/v1/projects/se-demos-project/secrets/deskdrop-datadog-intake/versions/latest:access'
LIMIT = 32768

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('redirect rejected')


def fetch(opener, url, headers):
    request = urllib.request.Request(url, headers=headers, method='GET')
    with opener.open(request, timeout=5) as response:
        if response.status != 200:
            raise ValueError('request failed')
        body = response.read(LIMIT + 1)
        if len(body) > LIMIT:
            raise ValueError('response too large')
        if url.startswith(META) and response.headers.get('Metadata-Flavor') != 'Google':
            raise ValueError('invalid metadata response')
        return body


def verify_identity(opener):
    headers = {'Metadata-Flavor': 'Google'}
    expected = {'project/project-id': PROJECT, 'instance/name': INSTANCE, 'instance/zone': ZONE, 'instance/service-accounts/default/email': SERVICE_ACCOUNT}
    for path, wanted in expected.items():
        actual = fetch(opener, META + path, headers).decode().strip()
        if path == 'instance/zone':
            if not re.fullmatch(r'projects/[0-9]+/zones/' + ZONE, actual):
                raise ValueError('wrong zone')
        elif actual != wanted:
            raise ValueError('wrong runtime identity')


def runtime_identity(opener):
    verify_identity(opener)
    headers = {'Metadata-Flavor': 'Google'}
    token = json.loads(fetch(opener, META + 'instance/service-accounts/default/token', headers))['access_token']
    if not isinstance(token, str) or not token or len(token) > 8192 or '\n' in token:
        raise ValueError('invalid token')
    return token


def acquire(opener):
    token = runtime_identity(opener)
    response = json.loads(fetch(opener, SECRET, {'Authorization': 'Bearer ' + token}))
    secret = base64.b64decode(response['payload']['data'], validate=True)
    if not re.fullmatch(rb'[A-Za-z0-9]{32}', secret):
        raise ValueError('invalid intake key')
    return token, secret


def prepare_runtime(base='/run/deskdrop', owner=0):
    for directory in [base, base + '/secrets']:
        try:
            os.mkdir(directory, 0o700)
        except FileExistsError:
            pass
        st = os.lstat(directory)
        if not stat.S_ISDIR(st.st_mode) or st.st_uid != owner or stat.S_IMODE(st.st_mode) != 0o700:
            raise ValueError('unsafe runtime directory')


def save_secret(path, secret, owner=0):
    directory = os.path.dirname(path)
    st = os.stat(directory, follow_symlinks=False)
    if not stat.S_ISDIR(st.st_mode) or st.st_uid != owner or stat.S_IMODE(st.st_mode) != 0o700:
        raise ValueError('unsafe runtime directory')
    try:
        prior = os.lstat(path)
    except FileNotFoundError:
        prior = None
    if prior is not None:
        if not stat.S_ISREG(prior.st_mode) or prior.st_uid != owner or stat.S_IMODE(prior.st_mode) != 0o600 or prior.st_nlink != 1:
            raise ValueError('unsafe secret file')
    fd, temporary = tempfile.mkstemp(prefix='.intake-', dir=directory)
    try:
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode) or st.st_uid != owner or stat.S_IMODE(st.st_mode) != 0o600 or st.st_nlink != 1:
            raise ValueError('unsafe secret file')
        with os.fdopen(fd, 'wb', closefd=False) as f:
            f.write(secret)
            f.flush()
        os.replace(temporary, path)
    finally:
        os.close(fd)
        if os.path.exists(temporary):
            os.unlink(temporary)


def validate_images(images):
    patterns = [r'us-central1-docker\.pkg\.dev/se-demos-project/deskdrop/deskdrop@sha256:[a-f0-9]{64}', r'us-central1-docker\.pkg\.dev/se-demos-project/deskdrop/checker@sha256:[a-f0-9]{64}']
    if len(images) != 2 or any(not re.fullmatch(pattern, image) for pattern, image in zip(patterns, images)):
        raise ValueError('wrong image')


def pull_images(token, images, source, runner=subprocess.run):
    validate_images(images)
    if not re.fullmatch(r'[a-f0-9]{40}', source):
        raise ValueError('wrong source')
    with tempfile.TemporaryDirectory(prefix='registry-', dir='/run/deskdrop') as config:
        os.chmod(config, 0o700)
        env = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'DOCKER_CONFIG': config}
        opts = {'env': env, 'stdout': subprocess.DEVNULL, 'stderr': subprocess.DEVNULL, 'timeout': 120, 'check': True}
        runner(['docker', 'login', '--username', 'oauth2accesstoken', '--password-stdin', REGISTRY], input=token.encode(), **opts)
        for image in images:
            runner(['docker', 'pull', '--platform', 'linux/amd64', image], **opts)
            verify_images([image], source, runner, config)


def verify_images(images, source, runner=subprocess.run, config='/run/deskdrop'):
    env = {'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'DOCKER_CONFIG': config}
    for image in images:
        with tempfile.TemporaryFile(dir=config) as output:
            limit = lambda: resource.setrlimit(resource.RLIMIT_FSIZE, (4096, 4096))
            runner(['docker', 'image', 'inspect', '--format={{.Architecture}}|{{index .Config.Labels "org.opencontainers.image.revision"}}', image], env=env, stdout=output, stderr=subprocess.DEVNULL, timeout=15, check=True, preexec_fn=limit)
            output.seek(0)
            if output.read(4097).decode().strip() != 'amd64|' + source:
                raise ValueError('image identity mismatch')


def main():
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    if sys.argv[1] == 'verify':
        verify_identity(opener)
        return
    if sys.argv[1] == 'prepare-runtime':
        prepare_runtime()
        return
    if sys.argv[1] == 'management-refresh':
        prepare_runtime('/run/deskdrop-management')
        token = runtime_identity(opener)
        response = json.loads(fetch(opener, SECRET.replace('deskdrop-datadog-intake', 'deskdrop-datadog-management'), {'Authorization': 'Bearer ' + token}))
        secret = base64.b64decode(response['payload']['data'], validate=True)
        values = json.loads(secret)
        if set(values) != {'apiKey', 'appKey'} or not re.fullmatch(r'[A-Za-z0-9]{32}', values['apiKey']) or not re.fullmatch(r'[A-Za-z0-9]{40}', values['appKey']):
            raise ValueError('invalid management secret')
        save_secret('/run/deskdrop-management/management', secret)
        return
    if sys.argv[1] == 'secret-refresh':
        prepare_runtime()
        token, secret = acquire(opener)
        save_secret('/run/deskdrop/secrets/intake', secret)
        del token, secret
        return
    images, source = sys.argv[2:4], sys.argv[4]
    validate_images(images)
    if not re.fullmatch(r'[a-f0-9]{40}', source):
        raise ValueError('wrong source')
    prepare_runtime()
    if sys.argv[1] == 'verify-images':
        verify_images(images, source)
        return
    token, secret = acquire(opener)
    save_secret('/run/deskdrop/secrets/intake', secret)
    pull_images(token, images, source)
    del token, secret

if __name__ == '__main__':
    try:
        main()
    except Exception:
        print('Runtime authentication failed', file=sys.stderr)
        sys.exit(1)
PYCODE
